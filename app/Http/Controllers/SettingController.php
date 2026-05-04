<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Models\User;
use App\Services\RadarrService;
use App\Services\SonarrService;
use App\Services\TmdbService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class SettingController extends Controller
{
    public function index()
    {
        return response()->json(Setting::all());
    }

    public function update(Request $request)
    {
        foreach (Setting::$keys as $key) {
            if ($request->has($key)) {
                Setting::set($key, (string) $request->input($key));
            }
        }
        return response()->json(['success' => true, 'settings' => Setting::all()]);
    }

    public function test(Request $request, RadarrService $radarr, SonarrService $sonarr, TmdbService $tmdb)
    {
        $service = $request->input('service');
        try {
            $ok = match ($service) {
                'tmdb'     => (bool) $tmdb->get('/configuration'),
                'radarr'   => $radarr->testConnection(),
                'sonarr'   => $sonarr->testConnection(),
                'jellyfin' => $this->testJellyfin(),
                'plex'     => $this->testPlex(),
                default    => false,
            };
            return response()->json(['ok' => $ok]);
        } catch (\Exception $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()]);
        }
    }

    public function radarrProfiles(RadarrService $radarr)
    {
        try {
            return response()->json(['profiles' => $radarr->qualityProfiles(), 'folders' => $radarr->rootFolders()]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()]);
        }
    }

    public function sonarrProfiles(SonarrService $sonarr)
    {
        try {
            return response()->json(['profiles' => $sonarr->qualityProfiles(), 'folders' => $sonarr->rootFolders()]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()]);
        }
    }

    // Users
    public function users()
    {
        return response()->json(User::orderBy('created_at')->get(['id', 'username', 'display_name', 'role', 'created_at']));
    }

    public function createUser(Request $request)
    {
        $data = $request->validate(['username' => 'required|string|unique:users', 'password' => 'required|string|min:4', 'role' => 'in:admin,user']);
        $user = User::create(['username' => $data['username'], 'password' => Hash::make($data['password']), 'role' => $data['role'] ?? 'user']);
        return response()->json($user->only('id', 'username', 'display_name', 'role'), 201);
    }

    public function deleteUser(Request $request, int $id)
    {
        if ($request->user()->id === $id) abort(400, 'Kan jezelf niet verwijderen');
        User::findOrFail($id)->delete();
        return response()->json(['success' => true]);
    }

    private function testJellyfin(): bool
    {
        $url = Setting::get('jellyfin_url');
        $key = Setting::get('jellyfin_api_key');
        if (!$url || !$key) return false;
        $r = \Illuminate\Support\Facades\Http::withHeaders(['X-Emby-Token' => $key])->get("{$url}/System/Info");
        return $r->ok();
    }

    private function testPlex(): bool
    {
        $url = Setting::get('plex_url');
        $token = Setting::get('plex_token');
        if (!$url || !$token) return false;
        $r = \Illuminate\Support\Facades\Http::withHeaders(['X-Plex-Token' => $token, 'Accept' => 'application/json'])->get("{$url}/identity");
        return $r->ok();
    }
}
