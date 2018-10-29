import {
  ASTNode,
  FieldNode,
  GraphQLResolveInfo,
  Kind,
  OperationDefinitionNode,
  SelectionNode,
  ValueNode
} from 'graphql';
import { BaseEntity, Connection, SelectQueryBuilder } from 'typeorm';
import { RelationMetadata } from 'typeorm/metadata/RelationMetadata';

export type Hash<T> = {
  [key: string]: T;
}

export type Selection = {
  arguments?: Hash<{ name: string, value: any }>;
  children?: Hash<Selection>;
}

function parseLiteral(ast: ValueNode): any {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.OBJECT:
    {
      const value = Object.create(null);
      ast.fields.forEach((field) => {
        value[field.name.value] = parseLiteral(field.value);
      });
      return value;
    }
    case Kind.LIST:
      return ast.values.map(parseLiteral);
    default:
      return null;
  }
}

function getSelections(ast: OperationDefinitionNode): ReadonlyArray<SelectionNode> {
  if (ast &&
      ast.selectionSet &&
      ast.selectionSet.selections &&
      ast.selectionSet.selections.length)
  {
    return ast.selectionSet.selections;
  }
  return [];
}

function isFragment(ast: ASTNode) {
  return ast.kind === 'InlineFragment' || ast.kind === 'FragmentSpread';
}

function getAST(ast: ASTNode, info: GraphQLResolveInfo) {
  if (ast.kind === 'FragmentSpread') {
    const fragmentName = ast.name.value;
    return info.fragments[fragmentName];
  }
  return ast;
}

function flattenAST(ast: ASTNode, info: GraphQLResolveInfo, obj: Hash<Selection> = {}): Hash<Selection> {
  return getSelections(ast as OperationDefinitionNode).reduce((flattened, n) => {
    if (isFragment(n)) {
      flattened = flattenAST(getAST(n, info), info, flattened);
    }
    else {
      const node: FieldNode = n as FieldNode;
      const name = (node as FieldNode).name.value;
      if (flattened[name]) {
        Object.assign(flattened[name].children, flattenAST(node, info, flattened[name].children));
      }
      else {
        flattened[name] = {
          arguments: node.arguments ? node.arguments.map(({ name, value }) =>
            ({ [name.value]: parseLiteral(value) })).reduce((p, n) => ({ ...p, ...n }), {}) : {},
          children: flattenAST(node, info)
        };
      }
    }
    return flattened;
  }, obj);
}

export function graphqlFields(info: GraphQLResolveInfo, obj: Hash<Selection> = {}): Selection {
  const fields = info.fieldNodes;
  return { children: fields.reduce((o, ast) => flattenAST(ast, info, o), obj) };
}

export function select(model: Function | string, selection: Selection | null,
  connection: Connection, qb: SelectQueryBuilder<typeof BaseEntity>,
  alias: string, history?: Set<RelationMetadata>)
{
  const meta = connection.getMetadata(model);
  if (selection && selection.children) {
    const fields = meta.columns
      .filter(field => {
        return field.propertyName in selection.children!;
      });
    fields.forEach(field => qb = qb.addSelect(`${alias}.${field.propertyName}`,
      `${alias}_${field.propertyName}`));
    const relations = meta.relations;
    relations.forEach(relation => {
      if (relation.propertyName in selection.children!) {
        const target = connection.getRepository(relation.target).target;
        const name = typeof target == 'string' ? target : target.name;
        const childAlias = alias + '_' + name;
        if (relation.inverseRelation) {
          qb = qb.addFrom(relation.inverseRelation.entityMetadata.targetName,
            relation.inverseRelation.entityMetadata.targetName);
          qb = qb.leftJoin(alias + '.' + relation.propertyName, childAlias);
          qb = select(relation.inverseEntityMetadata.target,
            selection.children![relation.propertyName], connection, qb, childAlias);
        }
      }
    });
  }
  else if (selection === null) {
    history = history || new Set();
    const relations = meta.relations;
    relations.forEach(relation => {
      const childAlias = `${alias}_${relation.propertyName}`;
      if (relation.inverseRelation) {
        if (history!.has(relation.inverseRelation)) {
          qb = qb.addSelect(alias);
          return;
        }
        history!.add(relation);
        qb = qb.addFrom(relation.inverseRelation.entityMetadata.targetName,
          relation.inverseEntityMetadata.targetName);
        qb = qb.leftJoin(alias + '.' + relation.propertyName, childAlias);
        qb = select(relation.inverseEntityMetadata.targetName, null,
          connection, qb, childAlias, history);
      } else {
        qb = qb.addSelect(`${alias}.${relation.propertyName}`, childAlias);
      }
    });
  }
  return qb;
}

