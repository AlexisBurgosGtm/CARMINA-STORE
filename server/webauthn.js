const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'Carmina Store';

/** challengeId -> { challenge, user, type, expires } */
const challenges = new Map();

function pruneChallenges() {
  const now = Date.now();
  for (const [id, row] of challenges) {
    if (row.expires < now) challenges.delete(id);
  }
}

function saveChallenge(key, data) {
  pruneChallenges();
  challenges.set(key, { ...data, expires: Date.now() + 5 * 60 * 1000 });
}

function takeChallenge(key) {
  pruneChallenges();
  const row = challenges.get(key);
  challenges.delete(key);
  return row || null;
}

function getRpFromRequest(req) {
  const host = String(req.get('x-forwarded-host') || req.get('host') || 'localhost').split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '');
  const protoHeader = req.get('x-forwarded-proto');
  const protocol = protoHeader
    ? protoHeader.split(',')[0].trim()
    : req.protocol || 'http';
  const origin = `${protocol}://${host}`;
  return { rpID: hostname || 'localhost', origin };
}

function parseCredential(raw) {
  if (!raw) return null;
  try {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data?.id || !data?.publicKey) return null;
    return data;
  } catch {
    return null;
  }
}

async function buildRegistrationOptions(req, username, existingCred) {
  const { rpID } = getRpFromRequest(req);
  const userID = new TextEncoder().encode(username);

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID,
    userName: username,
    userDisplayName: username,
    userID,
    attestationType: 'none',
    excludeCredentials: existingCred
      ? [{ id: existingCred.id, transports: existingCred.transports }]
      : [],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  saveChallenge(`reg:${username}`, {
    challenge: options.challenge,
    user: username,
    type: 'registration',
  });

  return options;
}

async function verifyRegistration(req, username, response) {
  const { rpID, origin } = getRpFromRequest(req);
  const stored = takeChallenge(`reg:${username}`);
  if (!stored || stored.type !== 'registration') {
    throw new Error('Desafío WebAuthn expirado o inválido. Intenta de nuevo.');
  }

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error('No se pudo verificar el autenticador biométrico');
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
  return {
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString('base64url'),
    counter: credential.counter,
    transports: response.response?.transports || credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
  };
}

async function buildAuthenticationOptions(req, username, existingCred) {
  const { rpID } = getRpFromRequest(req);
  if (!existingCred) {
    throw new Error('Este usuario aún no tiene biometría registrada');
  }

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: [
      {
        id: existingCred.id,
        transports: existingCred.transports,
      },
    ],
    userVerification: 'preferred',
  });

  saveChallenge(`auth:${username}`, {
    challenge: options.challenge,
    user: username,
    type: 'authentication',
  });

  return options;
}

async function verifyAuthentication(req, username, response, existingCred) {
  const { rpID, origin } = getRpFromRequest(req);
  const stored = takeChallenge(`auth:${username}`);
  if (!stored || stored.type !== 'authentication') {
    throw new Error('Desafío WebAuthn expirado o inválido. Intenta de nuevo.');
  }
  if (!existingCred) {
    throw new Error('Credencial biométrica no encontrada');
  }

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: stored.challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: false,
    credential: {
      id: existingCred.id,
      publicKey: Buffer.from(existingCred.publicKey, 'base64url'),
      counter: Number(existingCred.counter) || 0,
      transports: existingCred.transports,
    },
  });

  if (!verification.verified) {
    throw new Error('Autenticación biométrica fallida');
  }

  const newCounter = verification.authenticationInfo?.newCounter;
  return {
    verified: true,
    counter: typeof newCounter === 'number' ? newCounter : existingCred.counter,
  };
}

module.exports = {
  parseCredential,
  buildRegistrationOptions,
  verifyRegistration,
  buildAuthenticationOptions,
  verifyAuthentication,
};
