import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			gcTime: 5 * 60 * 1000, // 5 minutes
			staleTime: 30 * 1000, // 30 seconds
		},
	},
});
