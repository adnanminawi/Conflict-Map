import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as adminsRepository from '../repositories/admins.repository';
import { AppError } from '../utils/AppError';

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error('JWT_SECRET is missing in .env (needs at least 16 characters)');
  }
  return secret;
}

// Checks username + password. Returns a token the admin sends with every request.
export async function login(username: string, password: string) {
  const admin = await adminsRepository.findByUsername(username);

  // Same message for "wrong username" and "wrong password", so attackers can't guess usernames
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    throw AppError.unauthorized('Wrong username or password');
  }

  const token = jwt.sign({ adminId: admin.id }, getSecret(), { expiresIn: '1d' });
  return { token, username: admin.username };
}

// Reads a token and returns the admin's id. Throws 401 if the token is fake or expired.
export function verifyToken(token: string): number {
  try {
    const payload = jwt.verify(token, getSecret()) as { adminId: number };
    return payload.adminId;
  } catch {
    throw AppError.unauthorized('Please log in again');
  }
}

// Used by the create-admin script
export async function createAdmin(username: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return adminsRepository.insert(username, passwordHash);
}