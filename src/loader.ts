import { Connection, BaseEntity, SelectQueryBuilder } from 'typeorm';
import { GraphQLResolveInfo, validate } from 'graphql';
import * as crypto from 'crypto';
import { set } from 'object-path';

import { select, graphqlFields, Selection } from './select';

export type LoaderOptions = {
  /**
   * Time-to-live for cache.
   */
  ttl?: number;
}

type QueueItem = {
  many: boolean;
  key: string;
  batchIdx: number;
  fields: Selection | null;
  where: any;
  resolve: (value?: any) => any,
  reject: (reason: any) => void,
  entity: Function|string
};

/**
 * GraphQLDatabaseLoader is a caching loader that folds a batch of different database queries into a singular query.
 */
export class GraphQLDatabaseLoader {

  private _queue: QueueItem[] = [];
  private _cache: Map<string, Promise<any>> = new Map();
  private _immediate?: NodeJS.Immediate;

  /**
   * Constructs an instance.
   * @param {Connection} connection The database connection.
   * @param {LoaderOptions} options (optional) Loader options.
   */
  constructor(public connection: Connection, public options: LoaderOptions = {}) { }

  /**
   * Load an entity from the database.
   * @param {typeof BaseEntity|string} entity The entity type to load.
   * @param where Query conditions.
   * @param {GraphQLResolveInfo} info (optional) GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T>}
   */
  async loadOne<T>(entity: Function|string, where: Partial<T>, info?: GraphQLResolveInfo): Promise<T | undefined> {
    // Create a md5 hash.
    const hash = crypto.createHash('md5');
    // Get the fields queried by GraphQL.
    const fields = info ? graphqlFields(info) : null;
    // Generate a key hash from the query parameters.
    const key = hash.update(JSON.stringify([ where, fields ]))
      .digest().toString('hex');
    // If the key matches a cache entry, return it.
    if (this._cache.has(key))
      return this._cache.get(key);
    // If we have an immediate scheduled, cancel it.
    if (this._immediate) {
      clearImmediate(this._immediate);
    }
    // Create a promise.
    const promise = new Promise<T|undefined>((resolve, reject) => {
      // Push resolve/reject to the queue.
      this._queue.push({ many: false, batchIdx: this._queue.length,
        key, where, fields, resolve, reject, entity });
    });
    // Set a new immediate.
    this._immediate = setImmediate(() => this.processAll());
    // Cache the promise.
    this._cache.set(key, promise);
    // Return the promise.
    return promise;
  }

  /**
   * Load multiple entities that meet the same criteria .
   * @param {Function|string} entity The entity type to load.
   * @param {Partial<T>} where The conditions to match.
   * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T?[]>}
   */
  async loadMany<T>(entity: Function|string, where: Partial<T>, info?: GraphQLResolveInfo): Promise<(T|undefined)[]> {
    // Create a md5 hash.
    const hash = crypto.createHash('md5');
    // Get the fields queried by GraphQL.
    const fields = info ? graphqlFields(info) : null;
    // Generate a key hash from the query parameters.
    const key = hash.update(JSON.stringify([ where, fields ])).digest().toString('hex');
    // If the key matches a cache entry, return it.
    if (this._cache.has(key))
      return this._cache.get(key);
    // If we have an immediate scheduled, cancel it.
    if (this._immediate) {
      clearImmediate(this._immediate);
    }
    // Create a promise.
    const promise = new Promise<(T|undefined)[]>((resolve, reject) => {
      // Push resolve/reject to the queue.
      this._queue.push({ many: true, batchIdx: this._queue.length,
        key, where, fields, resolve, reject, entity });
    });
    // Set a new immediate.
    this._immediate = setImmediate(() => this.processAll());
    // Cache the promise.
    this._cache.set(key, promise);
    // Return the promise.
    return promise;
  }

  /**
   * Load multiple entities with different criteria.
   * @param {Function|string} entity The entity type to load.
   * @param {Partial<T>[]} where A series of conditions to match.
   * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T?[]>}
   */
  async batchLoadMany<T>(entity: Function|string, where: Partial<T>[], info?: GraphQLResolveInfo): Promise<(T|undefined)[]> {
    return await Promise.all(where.map(w => this.loadOne(entity, w, info)));
  }

  /**
   * Clears the loader cache.
   */
  clear() {
    this._cache.clear();
  }

  /**
   * Process and clear the current queue.
   * @returns {Promise<void>}
   */
  protected async processAll() {
    // Clear and capture the current queue.
    const queue = this._queue.splice(0, this._queue.length);
    try {
      // Create a new QueryBuilder instance.
      return await this.connection.transaction(async entityManager => {
        // const now = Date.now().toString(16);
        return queue.map(q => {
          const name = typeof q.entity == 'string' ? q.entity : q.entity.name;
          const alias = "Q";
          let qb = entityManager.getRepository(name).createQueryBuilder(alias); //.getRepository(q.entity).createQueryBuilder();
          // qb = qb.from(name, alias);
          qb = select(name, q.fields, entityManager.connection,
            qb as any, alias);
          qb = qb.where(q.where);
          const promise = q.many ? qb.getMany() : qb.getOne();
          return promise.then(q.resolve, q.reject).finally(() => {
            this._cache.delete(q.key);
          });
        });
      });
    } catch (e) {
      // An error occurred, reject the entire queue.
      queue.forEach(q => {
        q.reject(e);
        this._cache.delete(q.key);
      });
    }
  }
}
