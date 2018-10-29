import { GraphQLInt, GraphQLResolveInfo, GraphQLString } from 'graphql';
import { Entity, Column, ManyToOne, OneToMany, Connection } from 'typeorm';
import { GraphQLDatabaseLoader } from '../../src';
import { builder } from '../schema/index';
import { Node } from './Node';
import { Post } from './Post';

@Entity()
@builder.type()
export class User extends Node {

  @builder.nonNull()
  @builder.field(GraphQLString)
  @Column('varchar')
  email!: string;

  @builder.nonNull()
  @builder.field(GraphQLString)
  @Column('varchar')
  firstName!: string;

  @builder.nonNull()
  @builder.field(GraphQLString)
  @Column('varchar')
  lastName!: string;

  @builder.nonNull()
  @builder.field(GraphQLInt)
  @Column('int')
  age!: number;

  @builder.nonNull()
  @builder.nonNullItems()
  @builder.list(() => Post)
  @OneToMany(type => Post, post => post.owner)
  posts!: Post[];

  @builder.query({
    returnType: {
      type: () => User, list: true, nonNullItems: true, nonNull: true
    }
  })
  async users(rootValue: any, args: any, context: { loader: GraphQLDatabaseLoader },
    info: GraphQLResolveInfo)
  {
    return context.loader.loadMany(User, {}, info);
  }
}
