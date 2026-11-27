import eventDispatchContract from '@angular/core/event-dispatch-contract.min.js?raw';
import { Module } from '@nestjs/common';
import { ExamplePage } from '@angular-stream/stream-example';
import { AngularStreamModule } from '@push-based/angular-stream-nestjs';
import { HelloController } from './api/hello.controller';
import { HelloService } from './api/hello.service';
import { config } from './app/app.config.server';

@Module({
  imports: [
    AngularStreamModule.forRoot({
      rootComponent: ExamplePage,
      config,
      eventDispatchContract,
      allowedHosts: ['localhost'],
      // Relative to the built server, dist/server/server.js.
      template: new URL('./index.server.html', import.meta.url),
      staticDir: new URL('../client/', import.meta.url),
    }),
  ],
  controllers: [HelloController],
  providers: [HelloService],
})
export class AppModule {}
