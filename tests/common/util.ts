export function toPlain(object: any) {
  return JSON.parse(JSON.stringify(object));
}
