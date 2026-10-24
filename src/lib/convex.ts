import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { useCallback } from "react";
import { getToken } from "./session";

// Every Convex function in Solis takes the access token. These hooks inject it so ViewModels
// pass only their real arguments. Pass "skip" to skip a query.
type WithToken = { token: string };
type ArgsOf<F extends FunctionReference<any, any>> = Omit<FunctionArgs<F>, "token">;

export function useSolisQuery<F extends FunctionReference<"query", "public", WithToken & Record<string, any>>>(
  fn: F,
  args: ArgsOf<F> | "skip",
): FunctionReturnType<F> | undefined {
  const token = getToken();
  return useQuery(fn, (args === "skip" || !token ? "skip" : { ...args, token }) as any);
}

export function useSolisMutation<F extends FunctionReference<"mutation", "public", WithToken & Record<string, any>>>(fn: F) {
  const mutate = useMutation(fn);
  return useCallback((args: ArgsOf<F>) => mutate({ ...args, token: getToken() ?? "" } as any), [mutate]) as (
    args: ArgsOf<F>,
  ) => Promise<FunctionReturnType<F>>;
}

export function useSolisAction<F extends FunctionReference<"action", "public", WithToken & Record<string, any>>>(fn: F) {
  const run = useAction(fn);
  return useCallback((args: ArgsOf<F>) => run({ ...args, token: getToken() ?? "" } as any), [run]) as (
    args: ArgsOf<F>,
  ) => Promise<FunctionReturnType<F>>;
}
