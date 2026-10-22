import type { State } from "../../entries.ts";
import { atBottom } from "../chat/Composer.states.tsx";
import { formHintsOf, type Form } from "./form.ts";
import { Questions } from "./Questions.tsx";
import {
  FORM_CHOOSING,
  FORM_CONFIRMING,
  FORM_CONTEXT,
  FORM_NOTING,
  FORM_OWN,
  FORM_WRITING,
} from "./samples.ts";

const questions = (form: Form) =>
  atBottom({ ask: () => <Questions form={form} />, hints: formHintsOf(form) });

export const questionsStates: readonly [State, ...State[]] = [
  { name: "Choosing", fill: "screen", view: questions(FORM_CHOOSING) },
  { name: "Writing a note", fill: "screen", view: questions(FORM_NOTING) },
  { name: "Yes or no", fill: "screen", view: questions(FORM_CONFIRMING) },
  { name: "Written answer", fill: "screen", view: questions(FORM_WRITING) },
  { name: "Own answer", fill: "screen", view: questions(FORM_OWN) },
  { name: "Context", fill: "screen", view: questions(FORM_CONTEXT) },
];
