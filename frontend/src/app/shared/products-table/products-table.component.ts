import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Product } from '../../core/models/product.models';

@Component({
  selector: 'app-products-table',
  imports: [CommonModule, MatTableModule, MatSortModule, MatPaginatorModule, MatTooltipModule],
  templateUrl: './products-table.component.html',
  styleUrl: './products-table.component.scss',
})
export class ProductsTableComponent implements AfterViewInit {
  private readonly data = new MatTableDataSource<Product>([]);

  @ViewChild(MatSort) private sort?: MatSort;

  @Input() set products(products: Product[]) {
    this.data.data = products || [];
  }

  @Input() emptyText = 'No products found.';
  @Input() total = 0;
  @Input() pageIndex = 0;
  @Input() pageSize = 10;
  @Input() pageLabel = '';
  @Input() pageSizeOptions = [10, 25, 50];
  @Input() showEditAction = false;
  @Output() readonly pageChange = new EventEmitter<PageEvent>();
  @Output() readonly editProduct = new EventEmitter<Product>();

  get columns(): string[] {
    return this.showEditAction
      ? ['product', 'links', 'numbers', 'status', 'listing', 'created', 'actions']
      : ['product', 'links', 'numbers', 'status', 'listing', 'created'];
  }

  get dataSource(): MatTableDataSource<Product> {
    return this.data;
  }

  ngAfterViewInit(): void {
    this.data.sortingDataAccessor = (product, property) => {
      switch (property) {
        case 'product':
          return `${product.title || ''} ${product.asin || ''}`.trim().toLowerCase();
        case 'numbers':
          return product.profit;
        case 'status':
          return product.status;
        case 'listing':
          return `${product.accountName || ''} ${product.listedByName || product.assignedListerName || ''} ${product.listedAt || ''}`
            .trim()
            .toLowerCase();
        case 'created':
          return new Date(product.createdAt).getTime();
        default:
          return '';
      }
    };

    if (this.sort) {
      this.data.sort = this.sort;
    }
  }
}
