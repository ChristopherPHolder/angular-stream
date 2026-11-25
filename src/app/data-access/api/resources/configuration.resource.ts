import { Observable } from 'rxjs';
import { TMDBConfigurationModel } from '../model/configuration.model';
import { baseUrlApiV3 } from './internal/base-urls.constant';
import { inject, Service } from '@angular/core';
import { HttpClient } from '@angular/common/http';

const URL_CONFIGURATION = [baseUrlApiV3, 'configuration'].join('/');

@Service()
export class ConfigurationResource {
  private readonly http: HttpClient = inject(HttpClient);
  getConfig = (): Observable<TMDBConfigurationModel> =>
    this.http.get<TMDBConfigurationModel>(URL_CONFIGURATION);
}
