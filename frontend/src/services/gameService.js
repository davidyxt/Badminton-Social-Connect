// Temporary frontend-only service.
// Replace the contents of this function with Supabase later.

export const createGame = async (gameData) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
  
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `temp-${Date.now()}`;
  
    return {
      id,
      ...gameData,
      status: "open",
    };
  };