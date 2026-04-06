import {
  REQUEST,
  REQUEST_CONTEXT,
  RESPONSE_INIT,
  StaticProvider,
  ɵConsole,
} from '@angular/core';
import {
  INITIAL_CONFIG,
  platformServer,
  ɵrenderInternal,
  ɵSERVER_CONTEXT,
} from '@angular/platform-server';
import bootstrap from '../../main.server';
import { html } from './html';

export async function render(url: string) {
  const platformProviders: StaticProvider[] = [
    {
      provide: REQUEST_CONTEXT,
      useValue: null,
    },
    {
      provide: RESPONSE_INIT,
      useValue: {
        status: 200,
        headers: new Headers({
          'Content-Type': 'text/html;charset=UTF-8',
        }),
      },
    },
  ];

  const platformRef = platformServer([
    {
      provide: INITIAL_CONFIG,
      useValue: {
        url,
        document: html,
      },
    },
    {
      provide: ɵSERVER_CONTEXT,
      useValue: 'Exp-1',
    },
    {
      // An Angular Console Provider that does not print a set of predefined logs.
      provide: ɵConsole,
      // Using `useClass` would necessitate decorating `Console` with `@Injectable`,
      // which would require switching from `ts_library` to `ng_module`. This change
      // would also necessitate various patches of `@angular/bazel` to support ESM.
      useFactory: () => console,
    },
    ...platformProviders,
  ]);

  const applicationRef = await bootstrap({ platformRef });
  // Block until application is stable.
  await applicationRef.whenStable();

  const content = await ɵrenderInternal(platformRef, applicationRef);
  platformRef.destroy();
  return content;
}
