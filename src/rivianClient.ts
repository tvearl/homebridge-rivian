import crypto from 'node:crypto';
import { vehicleCommandHmac } from './crypto';

const GRAPHQL_GATEWAY = 'https://rivian.com/api/gql/gateway/graphql';
const APOLLO_CLIENT_NAME = 'com.rivian.ios.consumer-apollo-ios';

/** Tokens that must be persisted between Homebridge restarts. */
export interface RivianTokens {
  accessToken: string;
  refreshToken: string;
  userSessionToken: string;
}

export interface RivianVehicle {
  id: string;
  vin: string;
  name: string;
  make?: string;
  model?: string;
  modelYear?: string;
  /** secp256r1 public key (hex) used as the ECDH peer key when signing commands. */
  vehiclePublicKey?: string;
  vasVehicleId?: string;
  supportedFeatures: { name: string; status: string }[];
}

export interface EnrolledPhone {
  vasPhoneId: string;
  publicKey: string;
  enrolled: {
    deviceType: string;
    deviceName: string;
    vehicleId: string;
    identityId: string;
    shortName: string;
  }[];
}

export interface RivianUserInfo {
  userId: string;
  vehicles: RivianVehicle[];
  enrolledPhones: EnrolledPhone[];
}

export interface LoginResult {
  /** True when the account requires an MFA/OTP code to finish signing in. */
  otpRequired: boolean;
}

export class RivianApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
    this.name = 'RivianApiError';
  }
}

/** Minimal, dependency-free client for Rivian's unofficial GraphQL API. */
export class RivianClient {
  private csrfToken = '';
  private appSessionToken = '';
  private accessToken = '';
  private refreshToken = '';
  private userSessionToken = '';
  private otpToken = '';

  constructor(tokens?: Partial<RivianTokens>) {
    if (tokens) {
      this.accessToken = tokens.accessToken ?? '';
      this.refreshToken = tokens.refreshToken ?? '';
      this.userSessionToken = tokens.userSessionToken ?? '';
    }
  }

  getTokens(): RivianTokens {
    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      userSessionToken: this.userSessionToken,
    };
  }

  get isAuthenticated(): boolean {
    return Boolean(this.userSessionToken);
  }

  private baseHeaders(): Record<string, string> {
    return {
      'User-Agent': 'RivianApp/707 CFNetwork/1237 Darwin/20.4.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Apollographql-Client-Name': APOLLO_CLIENT_NAME,
      'dc-cid': `m-ios-${crypto.randomUUID()}`,
    };
  }

  private async graphql<T = any>(
    headers: Record<string, string>,
    body: Record<string, unknown>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(GRAPHQL_GATEWAY, {
        method: 'POST',
        headers: { ...this.baseHeaders(), ...headers },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new RivianApiError(`Network error talking to Rivian: ${(err as Error).message}`);
    }

    let json: any;
    try {
      json = await response.json();
    } catch {
      throw new RivianApiError(`Rivian returned a non-JSON response (HTTP ${response.status})`);
    }

    if (Array.isArray(json?.errors) && json.errors.length) {
      const first = json.errors[0];
      const code: string | undefined = first?.extensions?.code;
      const reason: string | undefined = first?.extensions?.reason;
      const message = first?.message || code || 'Unknown Rivian API error';
      throw new RivianApiError(`${message}${reason ? ` (${reason})` : ''}`, code, json.errors);
    }

    return json.data as T;
  }

  /** Step 1 of auth: obtain a CSRF token + app session token. */
  async createCsrfToken(): Promise<void> {
    const data = await this.graphql<{ createCsrfToken: { csrfToken: string; appSessionToken: string } }>(
      {},
      {
        operationName: 'CreateCSRFToken',
        query:
          'mutation CreateCSRFToken { createCsrfToken { __typename csrfToken appSessionToken } }',
        variables: null,
      },
    );
    this.csrfToken = data.createCsrfToken.csrfToken;
    this.appSessionToken = data.createCsrfToken.appSessionToken;
  }

  /** Step 2: sign in with email + password. Returns whether MFA is needed. */
  async login(email: string, password: string): Promise<LoginResult> {
    if (!this.csrfToken) {
      await this.createCsrfToken();
    }
    const data = await this.graphql<{ login: any }>(
      { 'Csrf-Token': this.csrfToken, 'A-Sess': this.appSessionToken },
      {
        operationName: 'Login',
        query:
          'mutation Login($email: String!, $password: String!) { login(email: $email, password: $password) { __typename ... on MobileLoginResponse { __typename accessToken refreshToken userSessionToken } ... on MobileMFALoginResponse { __typename otpToken } } }',
        variables: { email, password },
      },
    );
    const login = data.login;
    if (login?.otpToken) {
      this.otpToken = login.otpToken;
      return { otpRequired: true };
    }
    this.accessToken = login.accessToken;
    this.refreshToken = login.refreshToken;
    this.userSessionToken = login.userSessionToken;
    return { otpRequired: false };
  }

  /** Step 2b (MFA accounts): finish sign-in with the emailed/texted OTP code. */
  async loginWithOtp(email: string, otpCode: string): Promise<void> {
    const data = await this.graphql<{ loginWithOTP: RivianTokens }>(
      { 'Csrf-Token': this.csrfToken, 'A-Sess': this.appSessionToken },
      {
        operationName: 'LoginWithOTP',
        query:
          'mutation LoginWithOTP($email: String!, $otpCode: String!, $otpToken: String!) { loginWithOTP(email: $email, otpCode: $otpCode, otpToken: $otpToken) { __typename ... on MobileLoginResponse { __typename accessToken refreshToken userSessionToken } } }',
        variables: { email, otpCode, otpToken: this.otpToken },
      },
    );
    this.accessToken = data.loginWithOTP.accessToken;
    this.refreshToken = data.loginWithOTP.refreshToken;
    this.userSessionToken = data.loginWithOTP.userSessionToken;
  }

  private authedHeaders(includeCsrf = false): Record<string, string> {
    const headers: Record<string, string> = {
      'A-Sess': this.appSessionToken,
      'U-Sess': this.userSessionToken,
    };
    if (includeCsrf) {
      headers['Csrf-Token'] = this.csrfToken;
    }
    return headers;
  }

  /** Fetch account info: user id, vehicles (+ public keys), and enrolled phones. */
  async getUserInfo(includePhones = true): Promise<RivianUserInfo> {
    const vehiclesFragment =
      'vehicles { id vin name vas { __typename vasVehicleId vehiclePublicKey } roles state vehicle { __typename id vin modelYear make model vehicleState { supportedFeatures { __typename name status } } } }';
    const phonesFragment =
      'enrolledPhones { __typename vas { __typename vasPhoneId publicKey } enrolled { __typename deviceType deviceName vehicleId identityId shortName } }';

    const data = await this.graphql<{ currentUser: any }>(this.authedHeaders(), {
      operationName: 'getUserInfo',
      query: `query getUserInfo { currentUser { __typename id ${vehiclesFragment} ${includePhones ? phonesFragment : ''} } }`,
      variables: null,
    });

    const user = data.currentUser;
    const vehicles: RivianVehicle[] = (user.vehicles ?? []).map((v: any) => ({
      id: v.id,
      vin: v.vin,
      name: v.name || v.vehicle?.model || 'Rivian',
      make: v.vehicle?.make,
      model: v.vehicle?.model,
      modelYear: v.vehicle?.modelYear,
      vehiclePublicKey: v.vas?.vehiclePublicKey,
      vasVehicleId: v.vas?.vasVehicleId,
      supportedFeatures: v.vehicle?.vehicleState?.supportedFeatures ?? [],
    }));

    const enrolledPhones: EnrolledPhone[] = (user.enrolledPhones ?? []).map((p: any) => ({
      vasPhoneId: p.vas?.vasPhoneId,
      publicKey: p.vas?.publicKey,
      enrolled: p.enrolled ?? [],
    }));

    return { userId: user.id, vehicles, enrolledPhones };
  }

  /** Enroll this instance's public key as a phone key (uses 1 of 2 slots). */
  async enrollPhone(args: {
    userId: string;
    vehicleId: string;
    publicKey: string;
    deviceType: string;
    deviceName: string;
  }): Promise<boolean> {
    const data = await this.graphql<{ enrollPhone: { success: boolean } }>(
      this.authedHeaders(true),
      {
        operationName: 'EnrollPhone',
        query:
          'mutation EnrollPhone($attrs: EnrollPhoneAttributes!) { enrollPhone(attrs: $attrs) { __typename success } }',
        variables: {
          attrs: {
            userId: args.userId,
            vehicleId: args.vehicleId,
            publicKey: args.publicKey,
            type: args.deviceType,
            name: args.deviceName,
          },
        },
      },
    );
    return Boolean(data.enrollPhone?.success);
  }

  /** Remove a previously enrolled phone key to free a slot. */
  async disenrollPhone(enrollmentId: string): Promise<boolean> {
    const data = await this.graphql<{ disenrollPhone: { success: boolean } }>(
      this.authedHeaders(true),
      {
        operationName: 'DisenrollPhone',
        query:
          'mutation DisenrollPhone($attrs: DisenrollPhoneAttributes!) { disenrollPhone(attrs: $attrs) { __typename success } }',
        variables: { attrs: { enrollmentId } },
      },
    );
    return Boolean(data.disenrollPhone?.success);
  }

  /**
   * Read vehicle telemetry. Each requested property resolves to
   * `{ timeStamp, value }` (or null when unavailable).
   */
  async getVehicleState(
    vehicleId: string,
    properties: string[],
  ): Promise<Record<string, { timeStamp: string; value: any } | null>> {
    const fragment = properties.map((p) => `${p} { timeStamp value }`).join(' ');
    const data = await this.graphql<{ vehicleState: any }>(this.authedHeaders(), {
      operationName: 'GetVehicleState',
      query: `query GetVehicleState($vehicleID: String!) { vehicleState(id: $vehicleID) { ${fragment} } }`,
      variables: { vehicleID: vehicleId },
    });
    return data.vehicleState ?? {};
  }

  /** Sign and send a command. Returns the command id for status polling. */
  async sendVehicleCommand(args: {
    command: string;
    vehicleId: string;
    phoneId: string;
    identityId: string;
    vehiclePublicKey: string;
    privateKey: string;
    params?: Record<string, unknown>;
  }): Promise<string | null> {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const hmac = vehicleCommandHmac(args.command, timestamp, args.vehiclePublicKey, args.privateKey);

    const attrs: Record<string, unknown> = {
      command: args.command,
      hmac,
      timestamp,
      vasPhoneId: args.phoneId,
      deviceId: args.identityId,
      vehicleId: args.vehicleId,
    };
    if (args.params) {
      attrs.params = args.params;
    }

    const data = await this.graphql<{ sendVehicleCommand: { id: string } }>(
      this.authedHeaders(true),
      {
        operationName: 'sendVehicleCommand',
        query:
          'mutation sendVehicleCommand($attrs: VehicleCommandAttributes!) { sendVehicleCommand(attrs: $attrs) { __typename id command state } }',
        variables: { attrs },
      },
    );
    return data.sendVehicleCommand?.id ?? null;
  }
}
