import bcrypt from 'bcrypt';

import {UserService} from './UserService.js';

export class AuthService {
  public static async generateHash(password: string): Promise<string> {
    return new Promise((resolve, reject) => {
      void bcrypt.hash(password, 10, (err, res) => {
        if (err) {
          return reject(err);
        }
        resolve(res);
      });
    });
  }

  public static async verifyHash(password: string, hash: string) {
    return new Promise((resolve, reject) => {
      void bcrypt.compare(password, hash, (err, res) => {
        if (err) {
          return reject(err);
        }
        return resolve(res);
      });
    });
  }

  public static async verifyCredentials(email: string, password: string) {
    const user = await UserService.email(email);

    if (!user?.password) {
      return false;
    }

    return await this.verifyHash(password, user.password);
  }
}
