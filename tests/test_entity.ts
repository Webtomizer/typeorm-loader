import { expect } from 'chai';
import { Chance } from 'chance';
import { Connection, createConnection, Repository } from 'typeorm';

import { GraphQLDatabaseLoader } from '../src';
import { seedDatabase } from './common/seed';
import { toPlain } from './common/util';
import { Post } from './entity/Post';
import { User } from './entity/User';

let connection: Connection;
let Posts: Post[], Users: User[];

describe('Entity loading', async function () {

  let userRepo: Repository<User>, postRepo: Repository<Post>;

  before(async () => {
    connection = await createConnection({
      name: 'entity',
      type: 'sqlite',
      database: 'test_entity.sqlite3',
      synchronize: true,
      dropSchema: false,
      entities: [Post, User],
      logging: false
    });

    await seedDatabase(connection);

    userRepo = connection.getRepository(User);
    postRepo = connection.getRepository(Post);

    Users = await userRepo.find({ relations: ['posts'] });
    Posts = await postRepo.find({ relations: ['owner'] });
  });

  const chance = new Chance();

  it('should construct correctly', () => {
    const loader = new GraphQLDatabaseLoader(connection);
    expect(loader).to.be.instanceof(GraphQLDatabaseLoader);
  });

  it('should load a single item by id', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const post = chance.pickone(Posts);
    const result = await loader.loadOne('Post', { id: post.id });
    expect(toPlain(result)).to.deep.equals(toPlain(post));
  });

  it('should batch-load many by ids', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const posts = chance.pickset(Posts, 4);
    const result = await loader.batchLoadMany('Post', posts.map(post => ({ id: post.id })));
    expect(toPlain(result)).to.deep.equals(toPlain(posts));
  });

  it('should batch-load many by title and owner', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const posts = chance.pickset(Posts, 4);
    const result = await loader.batchLoadMany('Post',
      posts.map(post => ({ title: post.title, owner: post.owner })));
    expect(toPlain(result)).to.deep.equals(toPlain(posts));
  });

  it('should load many by owner', async () => {
    const loader = new GraphQLDatabaseLoader(connection);
    const user = chance.pickone(Users);
    const owned = Posts.filter(p => p.owner.id == user.id);
    const results = await loader.loadMany('Post', { owner: { id: user.id } });
    expect(results).to.deep.include.members(owned);
  });

  it('should batch unrelated requests', async () => {
    const batchLoader = new GraphQLDatabaseLoader(connection);
    const randomPost = chance.pickone(Posts);
    const randomUser = chance.pickone(Users);
    const owned = randomUser.posts.map(
      post => Posts.find(p => p.id === post.id));
    const expected = [randomPost, randomUser, owned];
    const promises: Promise<any>[] = [
      batchLoader.loadOne('Post', { id: randomPost.id }),
      batchLoader.loadOne('User', { id: randomUser.id }),
      batchLoader.loadMany('Post', { owner: { id: randomUser.id } })
    ];
    const results = await Promise.all(promises);
    expect(toPlain(results))
      .to.deep.equal(toPlain(expected));
  });

});
