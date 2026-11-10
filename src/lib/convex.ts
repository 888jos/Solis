import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";

// Thin wrappers kept so ViewModels share one import: authentication now travels with the Convex client
// (Google sign-in, see app/AuthGate.tsx), not as an argument. Pass "skip" to skip a query.
type ArgsOf<F extends FunctionReference<any, any>> = FunctionArgs<F>;

export function useSolisQuery<F extends FunctionReference<"query", "public">>(fn: F, args: ArgsOf<F> | "skip"): FunctionReturnType<F> | undefined {
  return useQuery(fn, args as any);
}

export function useSolisMutation<F extends FunctionReference<"mutation", "public">>(fn: F) {
  return useMutation(fn) as unknown as (args: ArgsOf<F>) => Promise<FunctionReturnType<F>>;
}

export function useSolisAction<F extends FunctionReference<"action", "public">>(fn: F) {
  return useAction(fn) as unknown as (args: ArgsOf<F>) => Promise<FunctionReturnType<F>>;
}
