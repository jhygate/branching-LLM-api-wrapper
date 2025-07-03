import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BranchingChatComponent } from './branching-chat.component';

describe('BranchingChatComponent', () => {
  let component: BranchingChatComponent;
  let fixture: ComponentFixture<BranchingChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BranchingChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BranchingChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
