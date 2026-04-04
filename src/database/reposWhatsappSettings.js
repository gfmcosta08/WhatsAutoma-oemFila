'use strict';

const { query } = require('./connection');
const { encrypt, decrypt, maskSecret } = require('../utils/settingsCrypto');

const EMPRESA_ID = 1;

async function getRow(empresaId = EMPRESA_ID) {
  const r = await query(
    `SELECT empresa_id, access_token_enc, phone_number_id, verify_token, app_secret_enc,
            uazapi_base_url, uazapi_instance_token_enc, uazapi_admin_token_enc, uazapi_instance_phone, updated_at
     FROM whatsapp_integracao WHERE empresa_id = $1`,
    [empresaId]
  );
  return r.rows[0] || null;
}

async function getDecrypted(empresaId = EMPRESA_ID) {
  const row = await getRow(empresaId);
  if (!row) return null;
  let access_token = null;
  let app_secret = null;
  let uazapi_instance_token = null;
  let uazapi_admin_token = null;
  try {
    if (row.access_token_enc) access_token = decrypt(row.access_token_enc);
  } catch {
    access_token = null;
  }
  try {
    if (row.app_secret_enc) app_secret = decrypt(row.app_secret_enc);
  } catch {
    app_secret = null;
  }
  try {
    if (row.uazapi_instance_token_enc) uazapi_instance_token = decrypt(row.uazapi_instance_token_enc);
  } catch {
    uazapi_instance_token = null;
  }
  try {
    if (row.uazapi_admin_token_enc) uazapi_admin_token = decrypt(row.uazapi_admin_token_enc);
  } catch {
    uazapi_admin_token = null;
  }
  return {
    access_token,
    phone_number_id: row.phone_number_id || null,
    verify_token: row.verify_token || null,
    app_secret,
    uazapi_base_url: row.uazapi_base_url || null,
    uazapi_instance_token,
    uazapi_admin_token,
    uazapi_instance_phone: row.uazapi_instance_phone ? String(row.uazapi_instance_phone).replace(/\D/g, '') : null,
  };
}

async function getMaskedForAdmin(empresaId = EMPRESA_ID) {
  const row = await getRow(empresaId);
  if (!row) {
    return {
      phone_number_id: '',
      verify_token_masked: '',
      access_token_set: false,
      app_secret_set: false,
      uazapi_base_url: '',
      uazapi_instance_token_set: false,
      uazapi_instance_token_masked: '',
      uazapi_admin_token_set: false,
      uazapi_admin_token_masked: '',
      uazapi_instance_phone: '',
      using_database: false,
    };
  }
  let accessPreview = '';
  try {
    if (row.access_token_enc) {
      const t = decrypt(row.access_token_enc);
      accessPreview = maskSecret(t, 6);
    }
  } catch {
    accessPreview = '****';
  }
  let appSecretSet = false;
  try {
    appSecretSet = !!(row.app_secret_enc && decrypt(row.app_secret_enc));
  } catch {
    appSecretSet = !!row.app_secret_enc;
  }
  let uazInstMasked = '';
  let uazInstSet = false;
  try {
    if (row.uazapi_instance_token_enc) {
      const t = decrypt(row.uazapi_instance_token_enc);
      uazInstMasked = maskSecret(t, 6);
      uazInstSet = true;
    }
  } catch {
    uazInstMasked = '****';
    uazInstSet = !!row.uazapi_instance_token_enc;
  }
  let uazAdmMasked = '';
  let uazAdmSet = false;
  try {
    if (row.uazapi_admin_token_enc) {
      const t = decrypt(row.uazapi_admin_token_enc);
      uazAdmMasked = maskSecret(t, 6);
      uazAdmSet = true;
    }
  } catch {
    uazAdmMasked = '****';
    uazAdmSet = !!row.uazapi_admin_token_enc;
  }
  const using_database = !!(
    row.access_token_enc ||
    row.phone_number_id ||
    row.verify_token ||
    row.app_secret_enc ||
    row.uazapi_instance_token_enc ||
    row.uazapi_admin_token_enc ||
    row.uazapi_base_url ||
    row.uazapi_instance_phone
  );
  return {
    phone_number_id: row.phone_number_id || '',
    verify_token_masked: row.verify_token ? maskSecret(row.verify_token, 4) : '',
    access_token_set: !!row.access_token_enc,
    access_token_masked: accessPreview,
    app_secret_set: appSecretSet,
    uazapi_base_url: row.uazapi_base_url || '',
    uazapi_instance_token_set: uazInstSet,
    uazapi_instance_token_masked: uazInstMasked,
    uazapi_admin_token_set: uazAdmSet,
    uazapi_admin_token_masked: uazAdmMasked,
    uazapi_instance_phone: row.uazapi_instance_phone || '',
    using_database: using_database,
  };
}

async function upsert(empresaId, fields) {
  const existing = await getRow(empresaId);
  const access_token_enc =
    fields.access_token_enc !== undefined
      ? fields.access_token_enc
      : existing
        ? existing.access_token_enc
        : null;
  const phone_number_id =
    fields.phone_number_id !== undefined ? fields.phone_number_id : existing ? existing.phone_number_id : null;
  const verify_token =
    fields.verify_token !== undefined ? fields.verify_token : existing ? existing.verify_token : null;
  const app_secret_enc =
    fields.app_secret_enc !== undefined
      ? fields.app_secret_enc
      : existing
        ? existing.app_secret_enc
        : null;
  const uazapi_base_url =
    fields.uazapi_base_url !== undefined
      ? fields.uazapi_base_url
      : existing
        ? existing.uazapi_base_url
        : null;
  const uazapi_instance_token_enc =
    fields.uazapi_instance_token_enc !== undefined
      ? fields.uazapi_instance_token_enc
      : existing
        ? existing.uazapi_instance_token_enc
        : null;
  const uazapi_admin_token_enc =
    fields.uazapi_admin_token_enc !== undefined
      ? fields.uazapi_admin_token_enc
      : existing
        ? existing.uazapi_admin_token_enc
        : null;
  const uazapi_instance_phone =
    fields.uazapi_instance_phone !== undefined
      ? fields.uazapi_instance_phone
      : existing
        ? existing.uazapi_instance_phone
        : null;

  await query(
    `INSERT INTO whatsapp_integracao (
       empresa_id, access_token_enc, phone_number_id, verify_token, app_secret_enc,
       uazapi_base_url, uazapi_instance_token_enc, uazapi_admin_token_enc, uazapi_instance_phone, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (empresa_id) DO UPDATE SET
       access_token_enc = EXCLUDED.access_token_enc,
       phone_number_id = EXCLUDED.phone_number_id,
       verify_token = EXCLUDED.verify_token,
       app_secret_enc = EXCLUDED.app_secret_enc,
       uazapi_base_url = EXCLUDED.uazapi_base_url,
       uazapi_instance_token_enc = EXCLUDED.uazapi_instance_token_enc,
       uazapi_admin_token_enc = EXCLUDED.uazapi_admin_token_enc,
       uazapi_instance_phone = EXCLUDED.uazapi_instance_phone,
       updated_at = NOW()`,
    [
      empresaId,
      access_token_enc,
      phone_number_id,
      verify_token,
      app_secret_enc,
      uazapi_base_url,
      uazapi_instance_token_enc,
      uazapi_admin_token_enc,
      uazapi_instance_phone,
    ]
  );
}

/**
 * Atualização parcial: só campos presentes em `patch` (valor null apaga coluna).
 * Para access_token / app_secret / uazapi tokens: string não vazia cifra; omitir chave = manter; null = apagar.
 */
async function updatePartial(empresaId, patch) {
  const row = await getRow(empresaId);
  let access_token_enc = row ? row.access_token_enc : null;
  let phone_number_id = row ? row.phone_number_id : null;
  let verify_token = row ? row.verify_token : null;
  let app_secret_enc = row ? row.app_secret_enc : null;
  let uazapi_base_url = row ? row.uazapi_base_url : null;
  let uazapi_instance_token_enc = row ? row.uazapi_instance_token_enc : null;
  let uazapi_admin_token_enc = row ? row.uazapi_admin_token_enc : null;
  let uazapi_instance_phone = row ? row.uazapi_instance_phone : null;

  if (Object.prototype.hasOwnProperty.call(patch, 'phone_number_id')) {
    phone_number_id =
      patch.phone_number_id == null || patch.phone_number_id === '' ? null : String(patch.phone_number_id).trim();
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'verify_token')) {
    verify_token = patch.verify_token == null || patch.verify_token === '' ? null : String(patch.verify_token);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'access_token')) {
    if (patch.access_token == null || patch.access_token === '') {
      access_token_enc = null;
    } else {
      access_token_enc = encrypt(String(patch.access_token));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'app_secret')) {
    if (patch.app_secret == null || patch.app_secret === '') {
      app_secret_enc = null;
    } else {
      app_secret_enc = encrypt(String(patch.app_secret));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uazapi_base_url')) {
    if (patch.uazapi_base_url == null || patch.uazapi_base_url === '') {
      uazapi_base_url = null;
    } else {
      uazapi_base_url = String(patch.uazapi_base_url).trim().replace(/\/$/, '');
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uazapi_instance_token')) {
    if (patch.uazapi_instance_token == null || patch.uazapi_instance_token === '') {
      uazapi_instance_token_enc = null;
    } else {
      uazapi_instance_token_enc = encrypt(String(patch.uazapi_instance_token));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uazapi_admin_token')) {
    if (patch.uazapi_admin_token == null || patch.uazapi_admin_token === '') {
      uazapi_admin_token_enc = null;
    } else {
      uazapi_admin_token_enc = encrypt(String(patch.uazapi_admin_token));
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'uazapi_instance_phone')) {
    if (patch.uazapi_instance_phone == null || patch.uazapi_instance_phone === '') {
      uazapi_instance_phone = null;
    } else {
      uazapi_instance_phone = String(patch.uazapi_instance_phone).replace(/\D/g, '') || null;
    }
  }

  await upsert(empresaId, {
    access_token_enc,
    phone_number_id,
    verify_token,
    app_secret_enc,
    uazapi_base_url,
    uazapi_instance_token_enc,
    uazapi_admin_token_enc,
    uazapi_instance_phone,
  });
}

module.exports = {
  getRow,
  getDecrypted,
  getMaskedForAdmin,
  upsert,
  updatePartial,
  encrypt,
  EMPRESA_ID,
};
