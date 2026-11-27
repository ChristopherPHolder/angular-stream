import { Injectable } from '@nestjs/common';

@Injectable()
export class HelloService {
  hello(): { message: string } {
    return { message: 'Hello from Nest on Fastify' };
  }
}
