# Effector Async Combine

This library provides combine functionality from Effector but for asynchronous functions.
It allows describing asynchronous idempotent logic (such as data loading, heavy asynchronous computations, worker communications) by creating stores and their computed stores, instead of managing event flows. This results in more predictable, maintainable, and often shorter code.

## Install

```bash
npm i --save effector-async-combine
```

## Comparison with Event-Based Approach

Let's consider the simplest code pattern that appears in almost every project using a user page example.
Requirements:
- Load and display user information when entering the user page. User ID comes from URL.
- Load new user when URL user ID changes
- Clear user data from store when page closes
- Show error state
- Show loading state

```ts
import { sample, createStore } from 'effector';
import { userRoute } from '@/routes';
import { User, loadUserFx } from '@/user';

const $user = createStore<null | User>(null);
const $isError = createStore(false);

sample({
    clock: [userRoute.opened, userRoute.updated],
    fn: ({ params }) => ({ id: params.userId }),
    target: loadUserFx
});

sample({
    clock: loadUserFx.doneData,
    target: [$user, $isError.reinit]
});

sample({
    clock: loadUserFx.fail,
    fn: () => true,
    target: $isError
})

sample({
    clock: userRoute.closed,
    target: [$user.reinit, $isError.reinit],
});
```

This looks okay but has a problem. If the URL ID changes quickly from 1 to 2, two requests will be sent. If request with ID 1 completes after ID 2, we'll get inconsistent state - we'll display user 1 for ID 2. Similar problem occurs if user leaves page during loading - `userRoute.closed` will trigger first, then `loadUserFx.doneData`, so store won't be cleared. This is a concurrency problem. The simplest fix is to introduce data versioning:

```ts
import { sample, createStore } from 'effector';
import { userRoute } from '@/routes';
import { User, loadUserFx as _loadUserFx } from '@/user';

const loadUserFx = attach({
    mapParams: (params: { id: string, version: number }) => params,
    effect: _loadUserFx,
})

const $version = createStore(0);
const $user = createStore<null | User>(null);
const $isError = createStore(false);

sample({
    clock: [userRoute.opened, userRoute.updated],
    source: $version,
    fn: (version, { params }) => ({ id: params.userId, version: version + 1 }),
    target: loadUserFx
});

sample({
    clock: loadUserFx,
    fn: ({ version }) => version,
    target: $version
})

sample({
    clock: loadUserFx.done,
    source: $version,
    filter: (version, { params }) => version === params.version,
    fn: ({ result }) => result,
    target: [$user, $isError.reinit]
});

sample({
    clock: loadUserFx.fail,
    source: $version,
    filter: (version, { params }) => version === params.version,
    fn: () => true,
    target: $isError
})

sample({
    clock: userRoute.closed,
    source: $version,
    fn: (version) => version + 1,
    target: [$user.reinit, $isError.reinit, $version],
});
```

Problem solved, but:
- Need to describe logic for every data change trigger (page open, URL change, page close)
- Need to manually manage request concurrency
- Lot of code

Now let's look at state-based approach with asyncCombine

```ts
import { sample, createStore } from 'effector';
import { userRoute } from '@/routes';
import { User, loadUserFx } from '@/user';

const userAsync = asyncCombine(
    userRoute.params.map((params) => params?.userId),
    (userId) => {
        if (userId === undefined) throw undefined; // works like init and reset
        return api.loadUser({ userId })
    }
);
```

That's all. In state-based approach we don't care about data update reasons, we just describe what data depends on and how to get it.

## API

### asyncCombine

```
(source, fn, config?) => AsyncCombine
```

- source: Record<string, Store | AsyncCombine> | Store | AsyncCombine  
  asyncCombine, store, or object with them. When changed, fn will be called.
- fn: (sourceValue, context, prevData?) => data  
  Function called when source changes. Should return data to be saved in asyncCombine.
  If function throws undefined, asyncCombine will enter uninitialized state.

  - sourceValue: source values
  - context: additional information for this fn call
    - context.prevSource: previous source value
    - context.signal: AbortSignal that cancels after function completion or [concurrent](#concurrency) cancellation
  - prevData: previous data
  - data: any data to save in asyncCombine  
- config:
  - config.onError: Event<unknown> | Effect<unknown, unknown>. Error handler for errors in fn.
  - config.sourceUpdateFilter: (prevSource, nextSource) => boolean. Determines if fn should be called on source change. Default: deepEqual.
  - config.logError: boolean. Log fn errors to console. Default: true.
- AsyncCombine:
  - [$state](#state)
  - $isError: Store<boolean> - whether last fn call ended with error
  - $isPending: Store<boolean> - whether fn is currently executing
  - $data: Store<data | undefined> - last data value or undefined if combine not initialized
  - changeData: EventCallable<Data> - manual data change. Cancels current fn call if any and clears context.prevSource
  - trigger: EventCallable<void> - manual fn call with current source value, ignoring config.sourceUpdateFilter

#### Examples

```ts
import { asyncCombine } from 'effector-async-combine';

const $userId = userProfileRoute.params.map((params) => params?.userId);

const userProfileAsync = asyncCombine(
    $userId,
    ({ userId }) => {
        if (userId === undefined) throw undefined; // uninitialized state
        return api.loadUser({ userId })
    }
);
```

```ts
import { asyncCombine } from 'effector-async-combine';

const $searchQuery = createStore('');
const $isPageOpen = usersSearchRoute.$isOpen;

const usersAsync = asyncCombine(
    { $searchQuery, $isPageOpen },
    ({ searchQuery, isPageOpen }) => { // automatically $prefix removed
        if (!isPageOpen) throw undefined; // uninitialized state
        return api.loadUsers({ searchQuery })
    }
);
```

### createExtension

Factory for creating [extensions](#extensions)

```
<ExtensionConfig>() =>  
(
    configFactory: (params: { $state, trigger }) => ({  
        handler?,  
        extend?,  
    })  
) => Extension
```

- ExtensionConfig: Allows typing extension parameters
  - ExtensionConfig.Params?: Parameters for manual combine trigger
  - ExtensionConfig.Context?: Additional data for context
  - ExtensionConfig.Data?: Data type that fn should return
- configFactory: Function called once during extension creation. Can create effector connections.
  - configFactory.params
    - $state: Store<CombineState> & { isPending: true, params?: ExtensionConfig.Params }. Current combine state. If combine is pending, state will contain parameters from manual trigger.
    - trigger: EventCallable<Config.Params> event for manual handler and original fn call
  - configFactory.result
    - handler?: Function that wraps original fn, allowing to modify logic. Similar to middleware in express.
    ```
    (
        originalFn: (ExtensionConfig.Context) => ExtensionResult<Data>,
        context: ExtensionConfig.Context & { prevData?: ExtensionConfig.Data, params?: ExtensionConfig.Params }
    ) => ExtensionResult<Data>
    ```
    - extend?: Object with additional fields for AsyncCombine
    - handler.ExtensionResult: Wrapper over data returned from fn. Allows modifying data with methods.
      - handler.ExtensionResult.getData: () => Data. Returns data
      - handler.ExtensionResult.mergeWithPrevData: (params?: { arrayKey: string }) => void. Merges array with current data and previous data.

- Extension: Function that takes original fn and adds additional functionality

#### Examples

##### Extend combine fields
```ts
import { createExtension, asyncCombine } from 'effector-async-combine';

const withLoadingAndErrorState = createExtension()(({ $state }) => {
    const $isLoadingAndError = $state.map(
        (state) => state?.isPending && state?.isError
    );
    return {
        extend: {
           $isLoadingAndError,       
        }
    }
});

const $userId = userProfileRoute.params.map((params) => params?.userId);

const userProfileAsync = asyncCombine(
    $userId,
    withLoadingAndErrorState(({ userId }) => {
        if (userId === undefined) throw undefined;
        return api.loadUser({ userId })
    })
);

console.log(userProfileAsync.$isLoadingAndError) // Store<boolean>
```

##### Extend handler context
```ts
import { createExtension, asyncCombine } from 'effector-async-combine';

const withFoo = createExtension<{ 
    context: { foo: string } // specify context
}>()( 
    () => {
        return {
            handler: (originalFn) => {
                return originalFn({ foo: 'bar' }) // pass extended context
            }
        }
    }
);

const $userId = userProfileRoute.params.map((params) => params?.userId);

const userProfileAsync = asyncCombine(
    $userId,
    withFoo(({ userId }, { foo }) => { // get additional context
        if (userId === undefined) throw undefined;
        console.log(foo) // bar
        return api.loadUser({ userId })
    })
);
```

##### Add additional logic
```ts
import { interval } from 'patronum';
import { createExtension, asyncCombine } from 'effector-async-combine';

// runs fn every minute if combine is in ready state
const withRefresh = createExtension<
    params: { isRefreshed: true }, // specify manual trigger params
    context: { isRefreshed: boolean } // specify context
>()(({ trigger, $state }) => {
        const start = createEvent();
        const stop = createEvent();
        const { tick, isRunning } = interval({
            timeout: 60000
            start,
            stop,
        });
        const $isRefreshing = $state.map(
            (state) => state?.isPending && !!state?.params?.isRefreshed
        )
        
        sample({
            clock: $state,
            source: isRunning,
            filter: (isRunning, state) => !isRunning && !state.isReady,
            target: start,
        });

        sample({
            clock: $state,
            filter: (state) => !state.isReady,
            target: stop
        });

        sample({
            clock: tick,
            fn: () => ({ isRefreshed: true }), // pass manual trigger params
            target: trigger
        })

        return {
            handler: (originalFn, _, isRefreshed) =>
                originalFn({ isRefreshed: isRefreshed ?? false }),
            extend: {
                $isRefreshing
            }
        };
    }
);

const $userId = userProfileRoute.params.map((params) => params?.userId);

const userProfileAsync = asyncCombine(
    $userId,
    withRefresh(({ userId }, { isRefreshed }) => {
        if (userId === undefined) throw undefined;
        console.log(isRefreshed) // true if started manually by extension, false otherwise
        return api.loadUser({ userId })
    })
);

console.log(userProfileAsync.$isRefreshing) // Store<boolean>
```

##### Data restriction and merging
```ts
import { createExtension, asyncCombine } from 'effector-async-combine';

const withDataMerge = createExtension<{
    data: { items: unknown[] } // specify data supertype
}>()(() => ({
    handler: async (originalFn) => {
        const result = await originalFn();
        const data = result.getData();
        console.log(data.items) // unknown[]
        result.mergeWithPrevData({ arrayKey: 'items' }); // merge items array with prev data
        return result;
    }
}));

const $isPageOpen = usersSearchRoute.$isOpen;

const usersAsync = asyncCombine(
    $isPageOpen,
    withDataMerge(async ({ isPageOpen }) => {
        if (!isPageOpen) throw undefined;
        const { users, total } = await api.loadUsers();
        return { // fit to data supertype
            total,
            items: users
        }
    })
);

asyncCombine(
    $isPageOpen,
    withDataMerge(async ({ isPageOpen }) => {
        if (!isPageOpen) throw undefined;
        // ts error because of data supertype
        return await api.loadUsers();
    })
);
```

### composeExtensions

Function to compose multiple extensions into one
```
composeExtensions: (...extensions) => extension
```

When composing extensions, you need to consider several rules:
- Extensions should not add the same fields to context
- Extensions should not add the same fields to extend

If these rules are violated, TypeScript will show an error

#### Example
```ts
import { createExtension, asyncCombine, composeExtensions } from 'effector-async-combine';

const ext1 = createExtension(...);
const ext2 = createExtension(...);
const ext3 = createExtension(...);

const ext4 = createExtension(...);
const ext5 = createExtension(...);

const ext6 = composeExtensions(ext4, ext5);

const combine = asyncCombine(
    $source,
    composeExtensions(ext1, ext2, ext3, ext6)(fn)
);
```

### fromConfiguration

Allows creating asyncCombines and extensions with global config
```
fromConfiguration: (
    config: AsyncCombine.config & { extension?: Extension }
) => { createExtension, asyncCombine }
```

#### Example
```ts
import { fromConfiguration } from 'effector-async-combine';

const globalExtension = createExtension<{ context: { foo: string } }>(...);

const { createExtension, asyncCombine } = fromConfiguration({
    extension: globalExtension,
    logError: false, // disable error logging
    sourceUpdateFilter: () => true // disable source equality check
});

const ext = createExtension()(() => ({
    handler: (originalFn, context) => {
        console.log(context.foo) // property from global extension
        return originalFn();
    } 
}));

const combine = asyncCombine(
    $source,
    (source, context) => {
        console.log(context.foo) // property from global extension
        return;
    }
)
```

## State

Contains all information about current async combine state.
State can be in 4 states:
- uninitialized: fn was never called or if fn threw undefined
- pending: fn was called and is waiting for result
- error: last fn call returned error
- ready: fn completed successfully

```ts
$state: Store<
    | undefined // uninitialized
    | { isPending: true, isError: boolean, isReady: false, prevData?: Data, } // pending
    | { isError: true, error: unknown, isPending: boolean, isReady: false, prevData?: Data } // error
    | { isReady: true, data: Data, isPending: false, isError: false } // ready
>
```

State is designed so that with a single state check you can access necessary data

```ts
state?.isReady && state.data // data
state?.isError && (state.error || state.prevData) // error && prevData
state?.isPending && state.prevData // prevData
```

## Prev Data

In fn you can access previous data value. To do this you need to manually specify type for 3rd parameter in fn (TS limitation).

```ts
const userAsync = asyncCombine(
    $source,
    (source, context, prevUser?: User) => {
        if (prevUser) { ... }
        return api.loadUser(source);
    }
)
```

## Uninitialized State

When working with async combine you often need to "turn it off", for example when closing page where it's used. In these cases you need to throw undefined in fn, after which combine will enter uninitialized state.

```ts
const userAsync = asyncCombine(
    $isPageOpen, // $isPageOpen state change will work like init and reset trigger
    (isPageOpen) => {
        if (!isPageOpen) throw undefined; // will set combine to uninitialized state
        return api.loadUser();
    }
)
```

If you don't like the approach with throwing undefined you can change this behavior through extension and make an explicit reset function.

```ts
const userAsync = asyncCombine(
    $isPageOpen,
    (isPageOpen, { reset }) => {
        if (!isPageOpen) return reset() // throws undefined under the hood
        return api.loadUser();
    }
)
```

## Concurrency

asyncCombine on source change or manual trigger call invokes fn with current parameters and cancels previous fn call. In other words it works in "takeLatest" mode. This guarantees combine state consistency.

## Source Batching 

asyncCombine batches all synchronous source updates and only then calls fn

## Extensions

Extensions provide ability to add and reuse additional logic in asyncCombine.  
They can:
- Add new data to context
- Add new fields to the combine itself
- Work as middleware for fn
- Allow adding new reusable effector logic
- Manually retrigger combine
- Specify supertype for data

To apply multiple extensions use [composeExtensions](#composeextensions) function.
Also there is possibility to add global extensions through [fromConfiguration](#fromconfiguration) function.

## AsyncCombine Composition

If you need to create a derived store over data from async combine, you can use standard effector functions like .map and combine:

```ts
const $normalizedData = dataAsync.$state.map((state) => {
    if (state?.isReady) { // 1 verbosity
        return normalizeData(state.data)
    } else {
        return defaultData; // 2 derived state
    }
});

const DataView: FC = () => {
    const isLoading = useUnit(combineAsync.$isPending); // 3
    const isError = useUnit(combineAsync.$isError); // 3
    const normalizedData = useUnit($normalizedData);

    if (isLoading) return <Loader />;

    if (isError) return <ErrorView />;

    return <div>{normalizedData}</div>;
}
```

This works but has several disadvantages:
- Verbosity when checking states in computed store
- Need to specify default state in derived store
- Error and loading states come from asyncCombine while we display data from different source. This adds code ambiguity.

Solution - use asyncCombine composition.

```ts
const normalizedDataAsync = asyncCombine(
    dataAsync, (data) => normalizeData(data)
);

const DataView: FC = () => {
    const normalizedData = useUnit(normalizedDataAsync.$state);

    if (normalizedData?.isLoading) return <Loader />;

    if (normalizedData?.isError) return <ErrorView />;

    return <div>{normalizedData?.data}</div>;
}
```

This way we achieve almost identical code to synchronous derived store creation through combine.

If asyncCombine (A) depends on another asyncCombine (B), A.fn will be called only when B enters ready state and A.fn will receive B's data immediately. Until B enters ready state, A will inherit its state. So if:
- B state = uninitialized, A state = uninitialized
- B state = pending, A state = pending
- B state = error, A state = error
- B state = ready, A.fn is called with B's data

If this behavior is not needed, you can pass combine.$state to source

```ts
const normalizedDataAsync = asyncCombine(
    dataAsync.$state, (state) => state.isReady ? normalizeData(state.data) : defaultData
);
```

See [example](https://stackblitz.com/edit/react-vvzhfya5?file=src%2Fmodel.ts) with more complex composition

## Examples
- [Simple pagination](https://stackblitz.com/edit/react-ts-jte4j3bp?file=model.ts)
- [Complex combine composition](https://stackblitz.com/edit/react-vvzhfya5?file=src%2Fmodel.ts)
- [Extension for infinite scroll](https://stackblitz.com/edit/react-ts-zaaz6y4u?file=model.ts)
