import { EventEmitter2 } from 'eventemitter2';
import { Engine, Rule } from 'json-rules-engine';

interface Customer {
  id: string;
  name: string;
  totalPurchases: number;
  weeklyPurchases: number;
  currentPurchaseAmount: number;
  lastPurchaseDate: Date;
}

interface DiscountEvent {
  customerId: string;
  discountType: string;
  discountPercentage: number;
  purchaseAmount: number;
  appliedImmediately: boolean;
}

interface PurchaseEvent {
  customerId: string;
  amount: number;
  date: Date;
}

class ShoppingRuleEngine {
  private engine: Engine;
  private eventEmitter: EventEmitter2;
  private customers: Map<string, Customer>;

  constructor() {
    this.engine = new Engine();
    this.eventEmitter = new EventEmitter2();
    this.customers = new Map();

    this.setupRules();
    this.setupEventListeners();
  }

  private setupRules() {
    const bigSpenderRule = new Rule({
      conditions: {
        all: [{
          fact: 'totalPurchases',
          operator: 'greaterThan',
          value: 500
        }]
      },
      event: {
        type: 'big-spender-discount',
        params: {
          discountPercentage: 20,
          appliedImmediately: false,
          message: 'Congratulations! You qualify for 20% off your next purchase!'
        }
      },
      priority: 1
    });

    const weeklySpenderRule = new Rule({
      conditions: {
        all: [{
          fact: 'weeklyPurchases',
          operator: 'greaterThanInclusive',
          value: 100
        }]
      },
      event: {
        type: 'weekly-spender-discount',
        params: {
          discountPercentage: 5,
          appliedImmediately: false,
          message: 'Great weekly shopping! 5% off your next purchase!'
        }
      },
      priority: 2
    });

    const dailyBigPurchaseRule = new Rule({
      conditions: {
        all: [{
          fact: 'currentPurchaseAmount',
          operator: 'greaterThanInclusive',
          value: 200
        }]
      },
      event: {
        type: 'daily-big-purchase-discount',
        params: {
          discountPercentage: 10,
          appliedImmediately: true,
          message: 'Instant 10% discount applied to this purchase!'
        }
      },
      priority: 3
    });

    const noDiscountRule = new Rule({
      conditions: {
        all: [
          { fact: 'currentPurchaseAmount', operator: 'lessThan', value: 100 },
          { fact: 'totalPurchases', operator: 'lessThanInclusive', value: 500 },
          { fact: 'weeklyPurchases', operator: 'lessThan', value: 100 }
        ]
      },
      event: {
        type: 'no-discount',
        params: {
          discountPercentage: 0,
          appliedImmediately: false,
          message: 'No discount available for this purchase.'
        }
      },
      priority: 4
    });

    this.engine.addRule(bigSpenderRule);
    this.engine.addRule(weeklySpenderRule);
    this.engine.addRule(dailyBigPurchaseRule);
    this.engine.addRule(noDiscountRule);
  }

  private setupEventListeners() {
    this.engine.on('success', async (event, almanac) => {
      const customerId = (await almanac.factValue('customerId')) as string;
      const purchaseAmount = (await almanac.factValue('currentPurchaseAmount')) as number;
    
      const discountEvent: DiscountEvent = {
        customerId,
        discountType: event.type,
        discountPercentage: event.params?.discountPercentage || 0,
        purchaseAmount,
        appliedImmediately: event.params?.appliedImmediately || false
      };
    
      this.eventEmitter.emit('discount-applied', discountEvent, event.params?.message);
    });
    

    this.eventEmitter.on('purchase-made', (purchaseEvent: PurchaseEvent) => {
      this.processPurchase(purchaseEvent);
    });

    this.eventEmitter.on('discount-applied', (discountEvent: DiscountEvent, message: string) => {
      console.log(`${message}`);
      console.log(`   Customer: ${discountEvent.customerId}`);
      console.log(`   Discount: ${discountEvent.discountPercentage}%`);
      console.log(`   Applied: ${discountEvent.appliedImmediately ? 'Immediately' : 'Next Purchase'}`);
      console.log('---');
    });
  }

  addCustomer(customer: Customer) {
    this.customers.set(customer.id, customer);
  }

  getCustomer(customerId: string): Customer | undefined {
    return this.customers.get(customerId);
  }

  async processPurchase(purchaseEvent: PurchaseEvent) {
    const customer = this.getCustomer(purchaseEvent.customerId);
    if (!customer) {
      console.log(`Customer ${purchaseEvent.customerId} not found!`);
      return;
    }

    customer.currentPurchaseAmount = purchaseEvent.amount;
    customer.totalPurchases += purchaseEvent.amount;

    const daysSinceLast = Math.floor(
      (purchaseEvent.date.getTime() - customer.lastPurchaseDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    customer.weeklyPurchases = daysSinceLast <= 7
      ? customer.weeklyPurchases + purchaseEvent.amount
      : purchaseEvent.amount;

    customer.lastPurchaseDate = purchaseEvent.date;

    console.log(`\nProcessing purchase for ${customer.name}`);
    console.log(`   Amount: $${purchaseEvent.amount}`);
    console.log(`   Total Purchases: $${customer.totalPurchases}`);
    console.log(`   Weekly Purchases: $${customer.weeklyPurchases}`);

    const facts = {
      customerId: customer.id,
      totalPurchases: customer.totalPurchases,
      weeklyPurchases: customer.weeklyPurchases,
      currentPurchaseAmount: customer.currentPurchaseAmount
    };

    try {
      const results = await this.engine.run(facts);
      if (results.events.length === 0) {
        console.log('No rules matched for this purchase.');
      }
    } catch (err) {
      console.error('Error running rules:', err);
    }
  }

  makePurchase(customerId: string, amount: number) {
    const event: PurchaseEvent = {
      customerId,
      amount,
      date: new Date()
    };

    this.eventEmitter.emit('purchase-made', event);
  }
}
// Demo
function runDemo() {
  console.log('Shopping Discount Rule Engine Demo\n');
  console.log('='.repeat(50));

  const ruleEngine = new ShoppingRuleEngine();

  const customer1: Customer = {
    id: 'cust-001',
    name: 'Alice Johnson',
    totalPurchases: 0,
    weeklyPurchases: 0,
    currentPurchaseAmount: 0,
    lastPurchaseDate: new Date()
  };

  const customer2: Customer = {
    id: 'cust-002',
    name: 'Bob Smith',
    totalPurchases: 0,
    weeklyPurchases: 0,
    currentPurchaseAmount: 0,
    lastPurchaseDate: new Date()
  };

  ruleEngine.addCustomer(customer1);
  ruleEngine.addCustomer(customer2);

  console.log('\nTesting Rule Scenarios:\n');

  console.log('Test 1: Small purchase ($50)');
  ruleEngine.makePurchase('cust-001', 50);

  setTimeout(() => {
    console.log('\nTest 2: Medium purchase ($150)');
    ruleEngine.makePurchase('cust-001', 150);
  }, 100);

  setTimeout(() => {
    console.log('\nTest 3: Large single purchase ($250)');
    ruleEngine.makePurchase('cust-002', 250);
  }, 200);

  setTimeout(() => {
    console.log('\nTest 4: Another purchase pushing total over $500');
    ruleEngine.makePurchase('cust-001', 400);
  }, 300);

  setTimeout(() => {
    console.log('\nTest 5: Purchase that triggers multiple rules ($300)');
    ruleEngine.makePurchase('cust-002', 300);
  }, 400);
}
runDemo();
/*
Set up a Node.js project with TypeScript and the required packages.
npm init -y
npm install json-rules-engine eventemitter2 ts-node typescript @types/node --save-dev
npx tsc --init
|-tsconfig.json
|-rules.ts
npx ts-node rules.ts
*/