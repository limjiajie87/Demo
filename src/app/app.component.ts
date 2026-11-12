import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { LinkRecord, LinksService } from './links.service';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

@Component({
  selector: 'app-root',
  imports: [ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  private readonly formBuilder = inject(FormBuilder);
  private readonly linksService = inject(LinksService);

  readonly links = signal<LinkRecord[]>([]);
  readonly createdLink = signal<LinkRecord | null>(null);
  readonly linksLoading = signal(true);
  readonly submitting = signal(false);
  readonly submitted = signal(false);
  readonly linksError = signal<string | null>(null);
  readonly submitError = signal<string | null>(null);

  readonly form = this.formBuilder.nonNullable.group({
    url: ['', [Validators.required, Validators.pattern(/^https?:\/\/\S+$/i)]]
  });

  readonly urlControl = this.form.controls.url;
  get urlError(): string | null {
    if (this.submitError()) return this.submitError();
    if (!(this.urlControl.dirty || this.urlControl.touched || this.submitted())) return null;
    if (this.urlControl.hasError('required')) return 'Enter a URL to shorten.';
    if (this.urlControl.invalid || !isHttpUrl(this.urlControl.value)) {
      return 'Enter a valid http:// or https:// URL.';
    }
    return null;
  }

  ngOnInit(): void {
    this.loadLinks();
  }

  loadLinks(): void {
    this.linksLoading.set(true);
    this.linksError.set(null);
    this.linksService.listLinks()
      .pipe(finalize(() => this.linksLoading.set(false)))
      .subscribe({
        next: (links) => this.links.set(links),
        error: () => this.linksError.set('We couldn’t load your links. Check the connection and try again.')
      });
  }

  submitLink(): void {
    this.submitted.set(true);
    this.submitError.set(null);
    this.createdLink.set(null);
    this.form.markAllAsTouched();

    if (this.form.invalid || !isHttpUrl(this.urlControl.value) || this.submitting()) return;

    this.submitting.set(true);
    this.linksService.createLink(this.urlControl.value)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (link) => {
          this.createdLink.set(link);
          this.form.reset();
          this.submitted.set(false);
          this.loadLinks();
        },
        error: (error: HttpErrorResponse) => {
          this.submitError.set(this.getErrorMessage(error));
        }
      });
  }

  private getErrorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) return 'Couldn’t reach the server. Please try again.';
    const message = error.error?.error;
    return typeof message === 'string' && message.length > 0
      ? message
      : 'The link couldn’t be shortened. Please check the URL and try again.';
  }
}
