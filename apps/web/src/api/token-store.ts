const accessTokenKey = 'wms_scan_access_token';
const refreshTokenKey = 'wms_scan_refresh_token';

function readToken(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(key);
}

function writeToken(key: string, token: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(key, token);
  }
}

function removeToken(key: string) {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(key);
  }
}

export const authTokenStore = {
  getAccessToken() {
    return readToken(accessTokenKey);
  },
  getRefreshToken() {
    return readToken(refreshTokenKey);
  },
  setTokens(tokens: { accessToken: string; refreshToken: string }) {
    writeToken(accessTokenKey, tokens.accessToken);
    writeToken(refreshTokenKey, tokens.refreshToken);
  },
  clear() {
    removeToken(accessTokenKey);
    removeToken(refreshTokenKey);
  },
};
