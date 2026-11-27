import { Controller, Get } from '@nestjs/common';
import { HelloService } from './hello.service';

@Controller('hello')
export class HelloController {
  constructor(private readonly hello: HelloService) {}

  @Get()
  get(): { message: string } {
    return this.hello.hello();
  }
}
