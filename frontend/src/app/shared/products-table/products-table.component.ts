import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Product } from '../../core/models/product.models';

@Component({
  selector: 'app-products-table',
  imports: [CommonModule, MatTableModule, MatTooltipModule],
  templateUrl: './products-table.component.html',
  styleUrl: './products-table.component.scss',
})
export class ProductsTableComponent {
  @Input() products: Product[] = [];
  @Input() emptyText = 'No products found.';

  readonly columns = ['product', 'links', 'numbers', 'status', 'listing', 'created'];
}
