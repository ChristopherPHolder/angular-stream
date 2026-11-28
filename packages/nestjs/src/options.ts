import { ConfigurableModuleBuilder } from '@nestjs/common';
import type { NodeHandlerOptions } from '@push-based/angular-ssr-stream-node';

/**
 * What `AngularStreamModule.forRoot()` takes: the Node adapter's options,
 * unchanged. `template` and `staticDir` are relative to the built server entry.
 */
export type AngularStreamModuleOptions = NodeHandlerOptions;

export const {
  ConfigurableModuleClass,
  MODULE_OPTIONS_TOKEN: ANGULAR_STREAM_OPTIONS,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<AngularStreamModuleOptions>({ moduleName: 'AngularStream' })
  .setClassMethodName('forRoot')
  .build();
