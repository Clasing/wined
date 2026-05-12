import { customType } from "drizzle-orm/pg-core";

/**
 * pgvector `vector(N)` column type. Stored as a postgres `vector` value.
 * Driver representation is the textual form `[a,b,c]`.
 */
export const vector = (name: string, dim: number) =>
  customType<{ data: number[]; driverData: string }>({
    dataType: () => `vector(${dim})`,
    toDriver: (value) => `[${value.join(",")}]`,
    fromDriver: (value) => {
      if (typeof value !== "string") {
        return value as unknown as number[];
      }
      return JSON.parse(value) as number[];
    },
  })(name);

/**
 * INET column type (postgres inet). Stored/returned as string.
 */
export const inet = (name: string) =>
  customType<{ data: string; driverData: string }>({
    dataType: () => `inet`,
  })(name);
