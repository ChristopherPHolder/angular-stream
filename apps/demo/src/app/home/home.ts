import { Component } from '@angular/core';
import { Race } from './race';
import { ResponsePlayer } from './response-player';

/**
 * The landing page: why a page should not wait for its slowest part, how one
 * response delivers it in pieces, and where the idea comes from. Everything on
 * it is a drawing; the example page does it for real.
 */
@Component({
  selector: 'demo-home',
  templateUrl: './home.html',
  styleUrl: './home.css',
  imports: [Race, ResponsePlayer],
})
export class Home {}
