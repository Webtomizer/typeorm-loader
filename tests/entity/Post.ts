import { GraphQLID, GraphQLResolveInfo, GraphQLString } from 'graphql';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { GraphQLDatabaseLoader } from '../../src';
import { builder } from '../schema/index';

import { Node } from './Node';
import { User } from './User';

@builder.input()
class PostInput {

  @builder.field(GraphQLID)
  id!: string|number;

  @builder.field(GraphQLString)
  title!: string;

  @builder.field(GraphQLString)
  content!: string;

  @builder.field(GraphQLID)
  owner!: string|number;
}

@Entity()
@builder.type()
export class Post extends Node {

  @builder.nonNull()
  @builder.field(GraphQLString)
  @Column('varchar')
  title!: string;

  @builder.nonNull()
  @builder.field(GraphQLString)
  @Column('text')
  content!: string;

  @ManyToOne(type => User, user => user.posts)
  @JoinColumn()
  @builder.nonNull()
  @builder.field(() => User)
  owner!: User;

  @builder.query({
    returnType: {
      type: () => Post, list: true, nonNullItems: true, nonNull: true
    },
    args: {
      where: {
        type: () => PostInput,
        defaultValue: {}
      }
    }
  })
  async posts(rootValue: any, args: any, context: { loader: GraphQLDatabaseLoader },
    info: GraphQLResolveInfo)
  {
    return context.loader.loadMany(Post, args.where, info);
  }
}
