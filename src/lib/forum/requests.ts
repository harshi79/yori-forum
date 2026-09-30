import { ForumError } from "./permissions";
export function boundedForm(form: FormData) {
  let size = 0;
  for (const [, value] of form) {
    size += typeof value === "string" ? value.length * 4 : value.size;
    if (size > 85000) throw new ForumError("Request too large");
  }
}
