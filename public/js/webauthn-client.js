/** Helpers WebAuthn (sin depender de CDN) */

function bufferToBase64URL(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : new Uint8Array(buffer.buffer || buffer);
  let str = '';
  bytes.forEach((b) => {
    str += String.fromCharCode(b);
  });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64URLToBuffer(base64url) {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

export function webauthnSupported() {
  return !!(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get);
}

export async function startRegistration(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLToBuffer(optionsJSON.challenge),
    user: {
      ...optionsJSON.user,
      id: base64URLToBuffer(optionsJSON.user.id),
    },
    excludeCredentials: (optionsJSON.excludeCredentials || []).map((c) => ({
      ...c,
      id: base64URLToBuffer(c.id),
    })),
  };

  const cred = await navigator.credentials.create({ publicKey });
  if (!cred) throw new Error('No se obtuvo credencial biométrica');

  return {
    id: cred.id,
    rawId: bufferToBase64URL(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bufferToBase64URL(cred.response.clientDataJSON),
      attestationObject: bufferToBase64URL(cred.response.attestationObject),
      transports: cred.response.getTransports?.() || [],
    },
  };
}

export async function startAuthentication(optionsJSON) {
  const publicKey = {
    ...optionsJSON,
    challenge: base64URLToBuffer(optionsJSON.challenge),
    allowCredentials: (optionsJSON.allowCredentials || []).map((c) => ({
      ...c,
      id: base64URLToBuffer(c.id),
    })),
  };

  const cred = await navigator.credentials.get({ publicKey });
  if (!cred) throw new Error('Autenticación biométrica cancelada');

  return {
    id: cred.id,
    rawId: bufferToBase64URL(cred.rawId),
    type: cred.type,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bufferToBase64URL(cred.response.clientDataJSON),
      authenticatorData: bufferToBase64URL(cred.response.authenticatorData),
      signature: bufferToBase64URL(cred.response.signature),
      userHandle: cred.response.userHandle
        ? bufferToBase64URL(cred.response.userHandle)
        : undefined,
    },
  };
}
