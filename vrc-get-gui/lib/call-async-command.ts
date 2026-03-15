import { emit, listen } from "@tauri-apps/api/event";

type AsyncCallResult<P, R> =
	| { type: "Result"; value: R }
	| { type: "Started" }
	| {
			type: "UnusedProgress";
			progress: P;
	  };
type AsyncCommand<A extends unknown[], P, R> = (
	channel: string,
	...args: A
) => Promise<AsyncCallResult<P, R>>;

type FinishedMessage<R> =
	| {
			type: "Success";
			value: R | "cancelled";
	  }
	| {
			type: "Failed";
			value: unknown;
	  };

export function callAsyncCommand<A extends unknown[], P, R>(
	command: AsyncCommand<A, P, R>,
	args: A,
	progress: (progress: P) => void,
): [cancel: () => void, promise: Promise<R | "cancelled">] {
	const channel = `async_call:${Date.now()}_${Math.random().toString(36).substring(7)}`;
	const cancel = () => emit(`${channel}:cancel`, {});

	return [cancel, callAsyncCommandImpl(channel, command, args, progress)];
}

async function callAsyncCommandImpl<A extends unknown[], P, R>(
	channel: string,
	command: AsyncCommand<A, P, R>,
	args: A,
	progress: (progress: P) => void,
): Promise<R | "cancelled"> {
	let finishHandler: (message: FinishedMessage<R>) => void;

	const [unlistenProgress, unlistenFinished, unlistenCancelled] =
		await Promise.all([
			listen<P>(`${channel}:progress`, (e) => progress(e.payload)),
			listen<FinishedMessage<R>>(`${channel}:finished`, (e) =>
				finishHandler?.(e.payload),
			),
			listen<void>(`${channel}:cancelled`, () =>
				finishHandler?.({ type: "Success", value: "cancelled" }),
			),
		]);

	const unlistenAll = () => {
		unlistenProgress();
		unlistenFinished();
		unlistenCancelled();
	};

	const finishPromise = new Promise<R | "cancelled">((resolve, reject) => {
		finishHandler = (message) => {
			unlistenAll();
			if (message.type === "Success") {
				resolve(message.value);
			} else {
				reject(message.value);
			}
		};
	});

	let result: AsyncCallResult<P, R>;
	try {
		result = await command(channel, ...args);
	} catch (e) {
		unlistenAll();
		throw e;
	}

	if (result.type === "Result") {
		unlistenAll();
		return result.value;
	}

	return await finishPromise;
}
