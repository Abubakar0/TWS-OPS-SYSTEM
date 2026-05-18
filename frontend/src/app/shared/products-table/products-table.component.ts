import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';

import { Product } from '../../core/models/product.models';

@Component({
  selector: 'app-products-table',
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTableModule],
  templateUrl: './products-table.component.html',
  styleUrl: './products-table.component.scss',
})
export class ProductsTableComponent {
  @Input() products: Product[] = [];
  @Input() emptyText = 'No products found.';

  readonly columns = ['product', 'links', 'numbers', 'status', 'owner', 'created'];
}
