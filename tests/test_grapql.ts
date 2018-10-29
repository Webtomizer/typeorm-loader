import { expect } from 'chai';
import { Chance } from 'chance';
import { graphql, GraphQLSchema } from 'graphql';
import { Connection, createConnection } from 'typeorm';
import { GraphQLDatabaseLoader } from '../src';

import { seedDatabase } from './common/seed';
import { Post } from './entity/Post';
import { User } from './entity/User';
import { builder } from './schema';

let connection: Connection;
let Posts: Post[], Users: User[];

describe('GraphQL resolvers', function () {

  let schema: GraphQLSchema;
  let loader: GraphQLDatabaseLoader;

  before(async () => {
    connection = await createConnection({
      name: 'graphql',
      type: 'sqlite',
      database: 'test_graphql.sqlite3',
      synchronize: true,
      dropSchema: true,
      entities: [Post, User],
      logging: false
    });

    await seedDatabase(connection);

    Users = await connection.getRepository(User).find({ relations: ['posts'] });
    Posts = await connection.getRepository(Post).find({ relations: ['owner'] });

    schema = builder.build();
    loader = new GraphQLDatabaseLoader(connection);
  });

  it('can make a simple query', async () => {
    // const loader = new GraphQLDatabaseLoader(connection);
    const result = await graphql(schema, '{ users { id } }', {}, {
      loader
    });
    expect(result.errors || []).to.deep.equal([]);
    expect(result).to.not.have.key('errors');
    expect(result.data).to.deep.equal({
      users: Users.map(({ id }) => ({ id: id.toString() }))
    });
  });

  it('can batch multiple queries', async () => {
    const results = await Promise.all([
      graphql(schema, '{ users { id } }', {}, {
        loader
      }),
      graphql(schema, '{ posts { id, owner { id } } }', {}, {
        loader
      })
    ]);
    const expected = [
      {
        data: {
          users: Users.map(({ id }) => ({ id: id.toString() }))
        }
      },
      {
        data: {
          posts: Posts.map(({ id, owner }) => ({
            id: id.toString(), owner: { id: owner.id.toString() }
          }))
        }
      }
    ];
    for (let result of results) {
      expect(result.errors || []).to.deep.equal([]);
      expect(result).to.not.have.key('errors');
    }
    expect(results).to.deep.equal(expected);
  });


});
