import { createSign } from 'crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleSheetsClient {
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('GOOGLE_SHEETS_SPREADSHEET_ID') &&
        this.configService.get<string>('GOOGLE_SHEETS_CLIENT_EMAIL') &&
        this.configService.get<string>('GOOGLE_SHEETS_PRIVATE_KEY'),
    );
  }

  getPrealertSheetName() {
    return this.configService.get<string>('GOOGLE_SHEETS_PREALERT_SHEET_NAME') || '预报';
  }

  getStatusSheetName() {
    return this.configService.get<string>('GOOGLE_SHEETS_STATUS_SHEET_NAME') || '状态';
  }

  async appendPrealertRows(headers: string[], rows: string[][]) {
    if (rows.length === 0) {
      return { updatedRows: 0 };
    }
    const spreadsheetId = this.requireConfig('GOOGLE_SHEETS_SPREADSHEET_ID');
    const sheetName = this.getPrealertSheetName();
    const range = `${this.quoteSheetName(sheetName)}!A:${this.columnName(headers.length)}`;
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range,
      )}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ values: rows }),
      },
    );
    const payload = (await response.json()) as { updates?: { updatedRows?: number }; error?: GoogleError };
    if (!response.ok || payload.error) {
      throw new ServiceUnavailableException(
        `Google Sheets append failed: ${payload.error?.message ?? response.statusText}`,
      );
    }
    return { updatedRows: payload.updates?.updatedRows ?? rows.length };
  }

  async readStatusRows() {
    return this.readRows(this.getStatusSheetName(), 'A:Z');
  }

  async readPrealertRows() {
    return this.readRows(this.getPrealertSheetName(), 'A:Z');
  }

  async updatePrealertRows(rows: Array<{ rowNumber: number; values: string[] }>) {
    if (rows.length === 0) {
      return { updatedRows: 0 };
    }
    const spreadsheetId = this.requireConfig('GOOGLE_SHEETS_SPREADSHEET_ID');
    const sheetName = this.getPrealertSheetName();
    const token = await this.getAccessToken();
    const data = rows.map((row) => ({
      range: `${this.quoteSheetName(sheetName)}!A${row.rowNumber}:${this.columnName(row.values.length)}${
        row.rowNumber
      }`,
      values: [row.values],
    }));
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data,
        }),
      },
    );
    const payload = (await response.json()) as {
      totalUpdatedRows?: number;
      error?: GoogleError;
    };
    if (!response.ok || payload.error) {
      throw new ServiceUnavailableException(
        `Google Sheets update failed: ${payload.error?.message ?? response.statusText}`,
      );
    }
    return { updatedRows: payload.totalUpdatedRows ?? rows.length };
  }

  private async readRows(sheetName: string, rangeA1: string) {
    const spreadsheetId = this.requireConfig('GOOGLE_SHEETS_SPREADSHEET_ID');
    const range = `${this.quoteSheetName(sheetName)}!${rangeA1}`;
    const token = await this.getAccessToken();
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(
        range,
      )}?majorDimension=ROWS`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    const payload = (await response.json()) as { values?: string[][]; error?: GoogleError };
    if (!response.ok || payload.error) {
      throw new ServiceUnavailableException(
        `Google Sheets read failed: ${payload.error?.message ?? response.statusText}`,
      );
    }
    return payload.values ?? [];
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) {
      return this.accessToken.value;
    }

    const now = Math.floor(Date.now() / 1000);
    const assertion = this.signJwt({
      iss: this.requireConfig('GOOGLE_SHEETS_CLIENT_EMAIL'),
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const payload = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!response.ok || !payload.access_token) {
      throw new ServiceUnavailableException(
        `Google token request failed: ${payload.error_description ?? payload.error ?? response.statusText}`,
      );
    }
    this.accessToken = {
      value: payload.access_token,
      expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
    };
    return this.accessToken.value;
  }

  private signJwt(payload: Record<string, string | number>) {
    const header = { alg: 'RS256', typ: 'JWT' };
    const encodedHeader = this.base64Url(JSON.stringify(header));
    const encodedPayload = this.base64Url(JSON.stringify(payload));
    const signer = createSign('RSA-SHA256');
    signer.update(`${encodedHeader}.${encodedPayload}`);
    signer.end();
    const privateKey = this.requireConfig('GOOGLE_SHEETS_PRIVATE_KEY').replace(/\\n/g, '\n');
    const signature = signer.sign(privateKey);
    return `${encodedHeader}.${encodedPayload}.${this.base64Url(signature)}`;
  }

  private base64Url(value: string | Buffer) {
    return Buffer.from(value)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private columnName(count: number) {
    let n = count;
    let name = '';
    while (n > 0) {
      const rem = (n - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      n = Math.floor((n - 1) / 26);
    }
    return name;
  }

  private quoteSheetName(sheetName: string) {
    return `'${sheetName.replace(/'/g, "''")}'`;
  }

  private requireConfig(key: string) {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured.`);
    }
    return value;
  }
}

type GoogleError = {
  message?: string;
};
