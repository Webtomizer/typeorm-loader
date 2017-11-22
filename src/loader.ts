import { Connection, BaseEntity } from 'typeorm';
import { GraphQLResolveInfo } from 'graphql';
import * as crypto from 'crypto';
import { set } from 'object-path';

import { select, graphqlFields, Selection } from './select';
import { Hash } from './hash';
import deepEqual = require('deep-equal');

export type LoaderOptions = {
  /**
   * Time-to-live for cache.
   */
  ttl?: number;
}

/**
 * GraphQLDatabaseLoader is a caching loader that folds a batch of different database queries into a singular query.
 */
export class GraphQLDatabaseLoader {

  private _queue: {
    many: boolean;
    key: string;
    fields: Selection | null;
    where: any;
    resolve: (value?: any) => any,
    reject: (reason: any) => void,
    entity: Function
  }[] = [];
  private _cache: Map<string, Promise<any>> = new Map();
  private _immediate?: number;

  /**
   * Constructs an instance.
   * @param {Connection} connection The database connection.
   * @param {LoaderOptions} options (optional) Loader options.
   */
  constructor(public connection: Connection, public options: LoaderOptions = {}) { }

  /**
   * Load an entity from the database.
   * @param {typeof BaseEntity} entity The entity type to load.
   * @param where Query conditions.
   * @param {GraphQLResolveInfo} info (optional) GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T>}
   */
  async loadOne<T>(entity: Function, where: Partial<T>, info?: GraphQLResolveInfo): Promise<T | undefined> {
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
    const promise = new Promise<T|undefined>((resolve, reject) => {
      // Push resolve/reject to the queue.
      this._queue.push({ many: false, key, where, fields, resolve, reject, entity });
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
   * @param {Function} entity The entity type to load.
   * @param {Partial<T>} where The conditions to match.
   * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T?[]>}
   */
  async loadMany<T>(entity: Function, where: Partial<T>, info?: GraphQLResolveInfo): Promise<(T|undefined)[]> {
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
      this._queue.push({ many: true, key, where, fields, resolve, reject, entity });
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
   * @param {Function} entity The entity type to load.
   * @param {Partial<T>[]} where A series of conditions to match.
   * @param {GraphQLResolveInfo} info (optional)  GraphQL resolver information. If not provided, all fields are returned.
   * @returns {Promise<T?[]>}
   */
  async batchLoadMany<T>(entity: Function, where: Partial<T>[], info?: GraphQLResolveInfo): Promise<(T|undefined)[]> {
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
      let qb = this.connection.createQueryBuilder();
      // Process each query in the queue.
      queue.forEach(q => {
        // Use a unique alias.
        const alias = q.key;
        // Add a FROM statement.
        qb = qb.addFrom(q.entity, alias + '_' + q.entity.name);
        const condition = `(${Object.keys(q.where)
          .map(key => `${alias}.${key}=:${alias}_${key}`).join(' AND ')})`;
        // Prefix variable names with the hash to make them unique. This must be a bug in TypeORM. TODO: Report this.
        const values = Object.keys(q.where).map(key => ({ [`${alias}_${key}`]: q.where[ key ] }))
          .reduce((p, n) => ({ ...p, ...n }), {});
        // LEFT JOIN the target table with the given conditions.
        // FIXME: TypeORM doesn't offer `addSelectAndMap` yet, we have to compensate.
        qb = qb.leftJoin(q.entity, alias, condition, values);
        // if (q.many)
        //   qb = qb.orWhere(condition, values);
        // Perform a recursive SELECT on each requested field.
        qb = select(q.entity, q.fields, this.connection, qb, alias);
      });
      /**
       * FIXME: This is a HUGE HACK. We're building the results from raw query results directly because TypeORM
       * doesn't support multiple entities in one query.
       */
      // Get the raw query results.
      const raw = await qb.getRawMany();
      // Iterate over the queue again.
      queue.forEach(q => {
        // Nothing found? Resolve with undefined.
        if (!raw.length)
          return q.resolve(undefined);
        if (!q.many) {
          // Find the first result with our key.
          const container = raw.find(r => !!Object.keys(r).find(k => k.startsWith(q.key)));
          const obj = this.entityRawToObject(container, q.key);
          // If it's null, resolve with nothing.
          if (obj === null)
            return q.resolve(undefined);
          // Convert our plain object to an entity, and resolve/reject accordingly.
          this.createEntityFromRaw(q.entity, obj).then(q.resolve, q.reject);
        } else { // many
          // The results we will push to.
          const results: any[] = [];
          raw.forEach(r => {
            const obj = this.entityRawToObject(r, q.key);
            // If it's null, do nothing.
            if (obj === null)
              return;
            // Convert our plain object to an entity
            const entity = this.createEntityFromRaw(q.entity, obj);
            // Get rid of duplicates.
            if (results.find(r => deepEqual(r, entity)))
              return;
            results.push(entity);
          });
          q.resolve(results.length ? Promise.all(results) : []);
          this._cache.delete(q.key);
        }
      });
    } catch (e) {
      // An error occurred, reject the entire queue.
      queue.forEach(q => {
        q.reject(e);
        this._cache.delete(q.key);
      });
    }
  }

  /**
   * Converts an entity raw to an object.
   * @param raw The entity raw.
   * @param {string} alias The alias.
   * @returns {any}
   */
  protected entityRawToObject(raw: any, alias: string) {
    // Extract the entity (entities) from the raw query.
    const entityRaw = Object.keys(raw)
    // Filter the entity we want.
      .filter(key => key.startsWith(alias))
      // Construct an object with the format { 'a.b.c': value }
      // We replace all underscores with dots. We will use this with `object-path` shortly.
      .map(key => ({
        [key.substr(alias.length + 1).replace(/_/g, '.')]: raw[ key ]
      }))
      // Concat all resulting properties into a single object.
      .reduce((p, n) => ({ ...p, ...n }), {});
    // If all fields are null, then nothing was returned. Return null.
    if (Object.values(entityRaw).reduce((p, n) => n === null && p, true))
      return null;
    // Create a data-holder for our data.
    const obj = Object.create(null);
    // Fill it with our data, expanding the dot-notation keys.
    Object.keys(entityRaw).forEach(key => set(obj, key, entityRaw[ key ]));
    return obj;
  }

  /**
   * Converts a plain object to an entity, including all child fields.
   * @param {typeof BaseEntity} entity The entity to convert to.
   * @param value The current value to convert.
   * @returns {Promise<BaseEntity>}
   */
  protected async createEntityFromRaw(entity: Function, value: any): Promise<BaseEntity> {
    // Create an instance of the entity.
    const ret = new (entity as any);
    // Get the entity's metadata.
    const meta = this.connection.getMetadata(entity);
    // Get all columns for the entity, filter by existing in value.
    const fields = meta.columns.filter(field => field.propertyName in value);
    // Copy over all fields.
    for(let field of fields) {
      ret[ field.propertyName ] = value[ field.propertyName ];
    }
    // Grab all relations for the entity.
    const relations = meta.relations;
    // Iterate over the relations.
    for (let rel of relations) {
      // If the relation is in the selected data:
      if (rel.propertyName in value)
        // Turn the value into an entity instance instead of plain object.
        ret[ rel.propertyName ] = await this.createEntityFromRaw(
          rel.inverseEntityMetadata.target as typeof BaseEntity, value[ rel.propertyName ]);
    }
    // Return the entity.
    return ret;
  }

}
