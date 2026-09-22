export const signIn = async (email, password) => {
  // Temporary fake login
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("Temporary login:", {
    email,
    password,
  });

  return {
    user: {
      email,
    },
  };
};

export const signUp = async ({
  email,
  password,
  firstName,
  lastName,
}) => {
  // Temporary fake signup
  await new Promise((resolve) => setTimeout(resolve, 500));

  console.log("Temporary signup:", {
    email,
    password,
    firstName,
    lastName,
  });

  return {
    user: {
      email,
      firstName,
      lastName,
    },
  };
};