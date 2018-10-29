
import { Chance } from 'chance';
import { Connection } from 'typeorm';
import { Post } from '../entity/Post';
import { User } from '../entity/User';

export async function seedDatabase(connection: Connection) {

  let UserRepo = connection.getRepository(User);
  let PostRepo = connection.getRepository(Post);

  const chance = new Chance();

  let users: User[] = [];
  let posts: Post[] = [];

  if (await UserRepo.count() === 0) {
    await connection.transaction(async entityManager =>
    {
      UserRepo = entityManager.getRepository(User);
      for (let i = 0; i < 50; i++) {
        const user = UserRepo.create({
          email: chance.email(),
          firstName: chance.first(),
          lastName: chance.last(),
          age: chance.age()
        });
        users.push(user);
        users = await entityManager.save(users);
      }
    })
  }

  if (await PostRepo.count() === 0) {
    await connection.transaction(async entityManager => {
      PostRepo = entityManager.getRepository(Post);
      for (let i = 0; i < 1000; i++) {
        const post = PostRepo.create({
          title: chance.sentence(),
          content: chance.paragraph({ sentences: chance.integer({ min: 1, max: 4 }) }),
          owner: chance.pickone(users)
        });
        posts.push(post);
      }
      await entityManager.save(posts);
    })
  }

}
