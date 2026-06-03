import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { TeamApiService } from '../../core/api/team-api.service';
import { AuthService } from '../../core/auth/auth.service';
import { User } from '../../core/models/auth.models';
import { Team } from '../../core/models/team.models';
import { ReferenceDataService } from '../../core/state/reference-data.service';
import { ConfirmService } from '../../core/ui/confirm.service';
import { ToastService } from '../../core/ui/toast.service';

@Component({
  selector: 'app-team-directory',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './team-directory.component.html',
  styleUrl: './team-directory.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TeamDirectoryComponent {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly teams = signal<Team[]>([]);
  readonly users = signal<User[]>([]);
  readonly selectedTeamId = signal('');
  readonly canManage = computed(() => {
    const role = this.auth.currentUser()?.role;
    return role === 'admin' || role === 'super_admin';
  });
  readonly editingTeam = computed(
    () => this.teams().find((team) => team.id === this.selectedTeamId()) || null,
  );

  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    memberIds: new FormControl<string[]>([], { nonNullable: true }),
  });
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly teamApi: TeamApiService,
    private readonly referenceData: ReferenceDataService,
    private readonly auth: AuthService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');

    this.teamApi.listTeams().subscribe({
      next: (teams) => {
        this.teams.set(teams);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not load teams.');
        this.loading.set(false);
      },
    });

    if (this.canManage()) {
      this.referenceData.getUsers().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (users) => this.users.set(users.filter((user) => user.status !== 'deleted')),
      });
    }
  }

  editTeam(team: Team): void {
    this.selectedTeamId.set(team.id);
    this.form.setValue({
      name: team.name,
      description: team.description || '',
      memberIds: team.members.map((member) => member.id),
    });
  }

  clearForm(): void {
    this.selectedTeamId.set('');
    this.form.reset({ name: '', description: '', memberIds: [] });
  }

  saveTeam(): void {
    if (!this.canManage() || this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const payload = this.form.getRawValue();
    const request = this.selectedTeamId()
      ? this.teamApi.updateTeam(this.selectedTeamId(), payload)
      : this.teamApi.createTeam(payload);

    request.subscribe({
      next: (team) => {
        this.toast.success(this.selectedTeamId() ? 'Team updated.' : 'Team created.');
        this.teams.update((teams) => {
          const next = [...teams];
          const index = next.findIndex((entry) => entry.id === team.id);

          if (index >= 0) {
            next[index] = team;
            return next;
          }

          return [team, ...next];
        });
        this.clearForm();
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not save team.');
        this.saving.set(false);
      },
      complete: () => this.saving.set(false),
    });
  }

  async deleteTeam(team: Team): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Delete team?',
      message: `This will remove ${team.name} and its member assignments.`,
      confirmText: 'Delete',
      tone: 'danger',
    });

    if (!confirmed) {
      return;
    }

    this.teamApi.deleteTeam(team.id).subscribe({
      next: () => {
        this.toast.success('Team deleted.');
        this.teams.update((teams) => teams.filter((entry) => entry.id !== team.id));
        if (this.selectedTeamId() === team.id) {
          this.clearForm();
        }
      },
      error: (error) => {
        this.error.set(error?.error?.message || 'Could not delete team.');
      },
    });
  }

  print(): void {
    window.print();
  }

  memberRoleLabel(member: Team['members'][number]): string {
    return member.roles?.length ? member.roles.join(', ') : member.role;
  }
}
