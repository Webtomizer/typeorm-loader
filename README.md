# typeorm-loader
A database-aware data-loader for use with GraphQL and TypeORM.

## Description

This package exports `GraphQLDatabaseLoader`, which is a caching loader that folds a batch of different database queries into a singular query.

## Installation

```
npm install typeorm-loader --save
```

## Usage

You should instantiate a new loader with every request (just to be on the safe side, you don't want data leaking between user sessions), you instantiate it by passing the TypeORM connection as the first argument.

```ts
  import { GraphQLDatabaseLoader } from 'typeorm-loader';

  const connection = createConnection({ ... });
  const loader = new GraphQLDatabaseLoader(connection);
```

After which you would use it like so:

```ts
  Query: {
    getUserById: async (_: any, args: { id: string }, context: any, info: GraphQLResolveInfo) => {
      const result = await loader.loadOne(User, { id }, info);
      return result;
    }
  }
```

## API

```ts

/**
 * Load an entity from the database.
 * @param {typeof BaseEntity} entity The entity type to load.
 * @param where Query conditions.
 * @param {GraphQLResolveInfo} info (optional) GraphQL resolver information. If not provided, all fields are returned.
 * @returns {Promise<T>}
 */
async loadOne<T>(entity: Function, where: Partial<T>, info?: GraphQLResolveInfo): Promise<T | undefined>;

/**
 * Load multiple entities that meet the same criteria .
 * @param {Function} entity The entity type to load.
 * @param {Partial<T>} where The conditions to match.
 * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
 * @returns {Promise<T?[]>}
 */
async loadMany<T>(entity: Function, where: Partial<T>, info?: GraphQLResolveInfo): Promise<(T|undefined)[]>;

/**
 * Load multiple entities with different criteria.
 * @param {Function} entity The entity type to load.
 * @param {Partial<T>[]} where A series of conditions to match.
 * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
 * @returns {Promise<T?[]>}
 */
async batchLoadMany<T>(entity: Function, where: Partial<T>[], info?: GraphQLResolveInfo): Promise<(T|undefined)[]>;

/**
 * Clears the loader cache.
 */
clear(): void;

```

## License (MIT)

Copyright 2017 Abdullah Ali

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
