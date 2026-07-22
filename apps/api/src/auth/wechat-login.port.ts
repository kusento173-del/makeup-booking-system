export const WECHAT_LOGIN_ADAPTER = Symbol('WECHAT_LOGIN_ADAPTER');

export interface WechatLoginIdentity {
  readonly externalSubject: string;
  readonly providerAppId: string;
  readonly unionId?: string | undefined;
}

export interface WechatLoginPort {
  exchangeCode(jsCode: string): Promise<WechatLoginIdentity>;
}
