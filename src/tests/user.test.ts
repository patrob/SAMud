import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { User } from '../models/user';
import { MudDatabase } from '../database/db';
import fs from 'fs';

describe('User Model', () => {
  let user: User;
  let testDbPath: string;

  beforeEach(async () => {
    testDbPath = './test-user.db';

    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize with test database
    MudDatabase.getInstance(testDbPath);
    user = new User();
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should create a new user', async () => {
    const userId = await user.create('testuser', 'password123');

    expect(userId).toBeGreaterThan(0);

    const foundUser = await user.findById(userId);
    expect(foundUser).toBeTruthy();
    expect(foundUser?.username).toBe('testuser');
  });

  it('should not allow duplicate usernames', async () => {
    await user.create('testuser', 'password123');

    await expect(user.create('testuser', 'password456')).rejects.toThrow('Username already exists');
  });

  it('should find user by username (case insensitive)', async () => {
    await user.create('TestUser', 'password123');

    const foundUser = await user.findByUsername('testuser');
    expect(foundUser).toBeTruthy();
    expect(foundUser?.username).toBe('TestUser');
  });

  it('should hash passwords securely', async () => {
    const password = 'mypassword123';
    const hash = await user.hashPassword(password);

    expect(hash).not.toBe(password);
    expect(hash.length).toBeGreaterThan(50); // bcrypt hashes are long

    const isValid = await user.verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await user.verifyPassword('wrongpassword', hash);
    expect(isInvalid).toBe(false);
  });

  it('should authenticate user with correct credentials', async () => {
    const userId = await user.create('authuser', 'password123');

    const authenticatedUser = await user.authenticate('authuser', 'password123');
    expect(authenticatedUser).toBeTruthy();
    expect(authenticatedUser?.id).toBe(userId);
  });

  it('should not authenticate user with wrong password', async () => {
    await user.create('authuser', 'password123');

    const authenticatedUser = await user.authenticate('authuser', 'wrongpassword');
    expect(authenticatedUser).toBeNull();
  });

  it('should not authenticate non-existent user', async () => {
    const authenticatedUser = await user.authenticate('nonexistent', 'password123');
    expect(authenticatedUser).toBeNull();
  });

  it('should update last login time', async () => {
    const userId = await user.create('loginuser', 'password123');

    // Initially, last_login should be null
    const userBefore = await user.findById(userId);
    expect(userBefore?.last_login).toBeNull();

    // Authenticate should update last_login
    await user.authenticate('loginuser', 'password123');

    const userAfter = await user.findById(userId);
    expect(userAfter?.last_login).not.toBeNull();
  });
});