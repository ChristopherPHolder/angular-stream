import { HttpClient } from '@angular/common/http';
import { Component, type Signal, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { DemoBackend, STEP_DELAYS, type Step, type StepData } from '../demo-backend';
import { HydrationStatus } from './hydration-status';

/** `?scale=` multiplies every delay: 3 is slow motion, 0 sends everything at once. */
export function readScale(value: string | null): number {
  const scale = Number(value ?? 1);
  return Number.isFinite(scale) && scale >= 0 && scale <= 10 ? scale : 1;
}

@Component({
  selector: 'demo-walkthrough',
  templateUrl: './walkthrough.html',
  styleUrl: './walkthrough.css',
  imports: [HydrationStatus],
})
export class Walkthrough {
  private readonly http = inject(HttpClient);
  protected readonly backend = inject(DemoBackend);
  protected readonly scale = readScale(inject(ActivatedRoute).snapshot.queryParamMap.get('scale'));

  /** Each step's delay at the current speed, in milliseconds. */
  protected readonly delay: Record<Step, number> = {
    a: STEP_DELAYS.a * this.scale,
    b: STEP_DELAYS.b * this.scale,
    c: STEP_DELAYS.c * this.scale,
    d: STEP_DELAYS.d * this.scale,
  };

  // All four requests start as soon as the page renders, on the server and in
  // the browser alike. In the browser they are held until the stream delivers
  // their responses.
  protected readonly a = this.load('a');
  protected readonly b = this.load('b');
  protected readonly c = this.load('c');
  protected readonly d = this.load('d');

  private load(step: Step): Signal<StepData | undefined> {
    return toSignal(
      this.http.get<StepData>(`/api/steps/${step}`, { params: { delay: this.delay[step] } }),
    );
  }
}
