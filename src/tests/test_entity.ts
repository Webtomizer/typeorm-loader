import { expect } from 'chai';
import { createConnection, Connection } from 'typeorm';
import { Chance } from 'chance';

import { GraphQLDatabaseLoader } from '../loader';
import { User } from './entity/User';
import { Post } from './entity/Post';

async function seedDatabase(connection: Connection) {

  const chance = new Chance();

  const users: User[] = [];
  const posts: Post[] = [];

  for (let i = 0; i < 10; i++) {
    const user = User.create({
      email: chance.email(),
      firstName: chance.first(),
      lastName: chance.last(),
      age: chance.age()
    });
    users.push(await connection.manager.save(user));
  }

  for (let i = 0; i < 10; i++) {
    const post = Post.create({
      title: chance.sentence(),
      content: chance.paragraph({ sentences: chance.integer({ min: 1, max: 20 }) }),
      owner: users[chance.integer({ min: 0, max: users.length-1 })]
    });
    posts.push(await connection.manager.save(post));
  }

  return { users, posts };
}

let connection: Connection;
let Posts: Post[], Users: User[];

before(async () => {
  connection = await createConnection({
    type: 'sqlite',
    database: 'test.sqlite3',
    synchronize: true,
    dropSchema: true,
    entities: [ Post, User ],
    logging: false
  });
  const { posts, users } = await seedDatabase(connection);
  Posts = posts;
  Users = users;
});

describe('GraphQLDatabaseLoader', () => {
  const chance = new Chance();
  it('should construct correctly', () => {
    const loader = new GraphQLDatabaseLoader(connection);
    expect(loader).to.be.instanceof(GraphQLDatabaseLoader);
  });
  it('should load a single item by id', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const post = chance.pickone(Posts);
    const result = await loader.loadOne(Post, { id: post.id });
    expect(result).to.deep.equals(post);
  });
  it('should batch-load many by ids', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const posts = chance.pickset(Posts, 4);
    const result = await loader.batchLoadMany(Post, posts.map(post => ({ id: post.id })));
    expect(result).to.deep.equals(posts);
  });
  it('should batch-load many by title and owner', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const posts = chance.pickset(Posts, 4);
    const result = await loader.batchLoadMany(Post, posts.map(post => ({ title: post.title, owner: post.owner.id })));
    expect(result).to.deep.equals(posts);
  });
  it('should load many by owner', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const user = chance.pickone(Users);
    const owned = Posts.filter(p => p.owner.id === user.id);
    const results = await loader.loadMany(Post, { owner: user.id });
    expect(results).to.deep.include.members(owned);
  });
});
