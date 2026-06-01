import { CommonModule, DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Meta, Title } from '@angular/platform-browser';

import { AuthService } from '../../core/auth/auth.service';
import { BRANDING } from '../../core/config/branding';

interface MarketingFaq {
  question: string;
  answer: string;
}

@Component({
  selector: 'app-marketing-home',
  imports: [CommonModule, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './marketing-home.component.html',
  styleUrl: './marketing-home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingHomeComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly canonicalHref = 'https://workspace.trendwavesolutions.com/';
  private readonly schemaScriptId = 'trendwave-marketing-schema';

  readonly branding = BRANDING;
  readonly currentUser = this.auth.currentUser;
  readonly primaryCta = computed(() =>
    this.auth.hasActiveSession()
      ? {
          label: 'Open Workspace',
          route: this.auth.homeForRole(this.currentUser()?.role),
        }
      : {
          label: 'Sign In',
          route: '/login',
        },
  );
  readonly workflows = [
    {
      title: 'Source better products',
      body: 'Give hunters clear rules, category structure, and weekly review gates without forcing them into spreadsheets.',
    },
    {
      title: 'Keep listings moving',
      body: 'Route products to listers, control account usage, and keep listing queues visible at the hunter, lister, and admin level.',
    },
    {
      title: 'Place and track orders',
      body: 'Capture order placement details, supplier status, shipping, delivery, and exceptions in one operational workflow.',
    },
    {
      title: 'Resolve issues fast',
      body: 'Turn order issues into product change requests, block risky listing work, and keep hunters and listers aligned.',
    },
  ];
  readonly useCases = [
    'eBay order placement workflow software',
    'hunter and lister marketplace operations',
    'product sourcing and listing queue management',
    'order issues, product fixes, and change requests',
    'account assignment and multi-user marketplace reporting',
  ];
  readonly faqs: MarketingFaq[] = [
    {
      question: 'What problems does TrendWave Commerce Hub solve?',
      answer:
        'It helps marketplace teams manage product hunting, listing queues, account assignments, order placement, order issues, and reporting in one shared workflow.',
    },
    {
      question: 'How does it connect hunters, listers, admins, and order processors?',
      answer:
        'Products, assignments, orders, issues, and change requests are linked so each role sees the work they own and the downstream impact of their actions.',
    },
    {
      question: 'Can it handle order issues and product correction workflows?',
      answer:
        'Yes. Order issues can be tied to specific products and can automatically create change requests for the assigned lister when a listing or source needs correction.',
    },
    {
      question: 'Is it built for operational teams instead of a generic CRM?',
      answer:
        'Yes. The workspace is designed for daily operational use: denser tables, role-specific dashboards, queue management, pagination, and process controls.',
    },
    {
      question: 'Can Trend Wave tailor the workflow for a different marketplace team?',
      answer:
        'Yes. The platform structure is designed to extend into new workflows, reports, roles, automations, and marketplace-specific operating models.',
    },
  ];

  constructor() {
    this.applySeo();
  }

  ngOnDestroy(): void {
    this.document.getElementById(this.schemaScriptId)?.remove();

    const canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical && canonical.href === this.canonicalHref) {
      canonical.remove();
    }
  }

  private applySeo(): void {
    const pageTitle =
      'TrendWave Commerce Hub | eBay Order Placement, Listing Workflow, and Marketplace Operations Software';
    const description =
      'TrendWave Commerce Hub helps sourcing, listing, and order teams manage product research, listing queues, order placement, product change requests, account control, and operational reporting.';

    this.title.setTitle(pageTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-image-preview:large' });
    this.meta.updateTag({ property: 'og:title', content: pageTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:url', content: this.canonicalHref });
    this.meta.updateTag({
      property: 'og:image',
      content: `${this.canonicalHref}marketing/workspace-preview.png`,
    });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: pageTitle });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({
      name: 'twitter:image',
      content: `${this.canonicalHref}marketing/workspace-preview.png`,
    });

    let canonical = this.document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = this.document.createElement('link');
      canonical.rel = 'canonical';
      this.document.head.appendChild(canonical);
    }
    canonical.href = this.canonicalHref;

    this.document.getElementById(this.schemaScriptId)?.remove();
    const script = this.document.createElement('script');
    script.id = this.schemaScriptId;
    script.type = 'application/ld+json';
    script.text = JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: BRANDING.companyName,
        url: 'https://trendwavesolutions.com/',
        logo: `${this.canonicalHref}trendwave-commerce-hub-icon.svg`,
      },
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: BRANDING.productName,
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: this.canonicalHref,
        description,
        provider: {
          '@type': 'Organization',
          name: BRANDING.companyName,
        },
        featureList: [
          'Product hunting workflow',
          'Listing queue management',
          'Order placement and tracking',
          'Order issues and change requests',
          'Account assignments and reporting',
        ],
      },
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: this.faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ]);
    this.document.head.appendChild(script);
  }
}
