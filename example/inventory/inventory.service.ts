import { Injectable } from '@nestjs/common'

@Injectable()
export class InventoryService {
  private readonly stock = new Map([
    ['apple', 10],
    ['banana', 5],
  ])

  /** Takes `quantity` items of `product` out of the stock, if there are enough. */
  public reserve(product: string, quantity: number): boolean {
    const available = this.stock.get(product) ?? 0
    if (quantity > available) {
      return false
    }
    this.stock.set(product, available - quantity)
    return true
  }
}
