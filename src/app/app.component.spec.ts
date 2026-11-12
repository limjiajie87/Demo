import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app.component';
import { LinkRecord } from './links.service';

describe('AppComponent', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function createFixture() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    http.expectOne('http://localhost:3000/api/links').flush([]);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the Snip form and links table', () => {
    const fixture = createFixture();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('h1')?.textContent).toContain('Make every link');
    expect(compiled.querySelector('label[for="url"]')).not.toBeNull();
    expect(compiled.querySelector('table')).toBeNull();
    expect(compiled.textContent).toContain('No links yet.');
  });

  it('rejects invalid URLs without sending a request', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    app.form.controls.url.setValue('ftp://example.com');
    app.submitLink();
    fixture.detectChanges();

    expect(app.urlError).toContain('valid http:// or https:// URL');
    http.expectNone('http://localhost:3000/api/links');
  });

  it('creates a link and refreshes the list', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    const created: LinkRecord = {
      code: 'a1B2c3',
      url: 'https://example.com/article',
      shortUrl: 'http://localhost:3000/a1B2c3',
      hits: 0,
      createdAt: '2026-11-12T08:00:00.000Z'
    };

    app.form.controls.url.setValue(created.url);
    app.submitLink();
    http.expectOne('http://localhost:3000/api/links').flush(created);
    http.expectOne('http://localhost:3000/api/links').flush([created]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(app.createdLink()).toEqual(created);
    expect(compiled.textContent).toContain(created.shortUrl);
    expect(compiled.textContent).toContain(created.url);
    expect(compiled.textContent).toContain('0');
  });

  it('shows API errors beside the URL field', () => {
    const fixture = createFixture();
    const app = fixture.componentInstance;
    app.form.controls.url.setValue('https://example.com');
    app.submitLink();
    http.expectOne('http://localhost:3000/api/links').flush(
      { error: 'URL was rejected by the server.' },
      { status: 400, statusText: 'Bad Request' }
    );
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('URL was rejected by the server.');
    expect(fixture.nativeElement.querySelector('#url-error')).not.toBeNull();
  });
});
