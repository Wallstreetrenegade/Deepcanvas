import {Keys} from './keys.js';
import {wrapRedis} from '../database/redis.js';
import {prisma} from '../database/prisma.js';

export class ProjectService {
  public static async id(id: string) {
    return wrapRedis(Keys.Project.id(id), async () => {
      return prisma.project.findUnique({where: {id}});
    });
  }

  public static async secret(key: string) {
    return wrapRedis(Keys.Project.secret(key), async () => {
      return prisma.project.findUnique({
        where: {
          secret: key,
        },
      });
    });
  }

  public static async public(key: string) {
    return wrapRedis(Keys.Project.public(key), async () => {
      return prisma.project.findUnique({
        where: {
          public: key,
        },
      });
    });
  }
}
