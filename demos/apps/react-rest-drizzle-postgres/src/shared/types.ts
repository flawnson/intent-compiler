export type ActiveUserSummary = {
  id: number;
  email: string;
  fullName: string;
  country: string;
  signupDate: string;
  orderCount: number;
  totalSpendCents: number;
};

export type ApiOk<T> = {
  data: T;
};

export type ApiError = {
  error: string;
};
