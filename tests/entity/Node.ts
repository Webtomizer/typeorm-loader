import { GraphQLID, GraphQLString } from 'graphql';
import { BaseEntity, PrimaryGeneratedColumn } from 'typeorm';
import { builder } from '../schema';

@builder.interface({ resolveType: (value: Node) => value.kind })
export class Node extends BaseEntity {
  /**
   * The most basic attribute identifying a node: its type (class name).
   * @type {string}
   */
  @builder.field(GraphQLString) // define as a `String` field
  @builder.nonNull() // define as not nullable
  // attach a description, this will appear in your schema definition
  @builder.description('Type of this Node.')
  kind: string = this.constructor.name;

  /**
   * The unique ID of this node.
   * @type {string}
   */
  @builder.nonNull() // this can not be null!
  @builder.field(GraphQLID) // define the field with a type of ID
  @builder.description('A unique ID for this object.')
  @PrimaryGeneratedColumn()
  id!: string|number;
}
