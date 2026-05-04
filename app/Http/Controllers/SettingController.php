<?php

namespace App\Http\Controllers;

use App\Models\Setting;
use App\Models\User;
use App\Services\RadarrService;
use App\Services\SonarrService;
use App\Services\TmdbService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;

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

    public function test(Request $request)
    {
        $service = $request->input('service');

        // Sla eerst de huidige instellingen op
        foreach (Setting::$keys as $key) {
            if ($request->has($key)) {
                Setting::set($key, (string) $request->input($key));
            }
        }

        try {
            $ok = match ($service) {
                'tmdb'     => $this->testTmdb(),
                'radarr'   => $this->testRadarr(),
                'sonarr'   => $this->testSonarr(),
                'jellyfin' => $this->testJellyfin(),
                'plex'     => $this->testPlex(),
                default    => false,
            };
            return response()->json(['ok' => $ok]);
        } catch (\Exception $e) {
            return response()->json(['ok' => false, 'error' => $e->getMessage()]);
        }
    }

    private function testTmdb(): bool
    {
        $key = Setting::get('tmdb_api_key');
        if (!$key) return false;
        $r = Http::timeout(10)->get("https://api.themoviedb.org/3/configuration", ['api_key' => $key]);
        return $r->ok();
    }

    private function testRadarr(): bool
    {
        $url = Setting::get('radarr_url');
        $key = Setting::get('radarr_api_key');
        if (!$url || !$key) return false;
        $r = Http::timeout(10)->withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/system/status");
        return $r->ok();
    }

    private function testSonarr(): bool
    {
        $url = Setting::get('sonarr_url');
        $key = Setting::get('sonarr_api_key');
        if (!$url || !$key) return false;
        $r = Http::timeout(10)->withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/system/status");
        return $r->ok();
    }

    private function testJellyfin(): bool
    {
        $url = Setting::get('jellyfin_url');
        $key = Setting::get('jellyfin_api_key');
        if (!$url || !$key) return false;
        $r = Http::timeout(10)->withHeaders(['X-Emby-Token' => $key])->get("{$url}/System/Info");
        return $r->ok();
    }

    private function testPlex(): bool
    {
        $url = Setting::get('plex_url');
        $token = Setting::get('plex_token');
        if (!$url || !$token) return false;
        $r = Http::timeout(10)->withHeaders(['X-Plex-Token' => $token, 'Accept' => 'application/json'])->get("{$url}/identity");
        return $r->ok();
    }

    public function radarrProfiles()
    {
        try {
            $url = Setting::get('radarr_url');
            $key = Setting::get('radarr_api_key');
            if (!$url || !$key) return response()->json(['error' => 'Radarr niet geconfigureerd']);
            $profiles = Http::withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/qualityprofile")->json();
            $folders  = Http::withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/rootfolder")->json();
            return response()->json(['profiles' => $profiles, 'folders' => $folders]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()]);
        }
    }

    public function sonarrProfiles()
    {
        try {
            $url = Setting::get('sonarr_url');
            $key = Setting::get('sonarr_api_key');
            if (!$url || !$key) return response()->json(['error' => 'Sonarr niet geconfigureerd']);
            $profiles = Http::withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/qualityprofile")->json();
            $folders  = Http::withHeaders(['X-Api-Key' => $key])->get("{$url}/api/v3/rootfolder")->json();
            return response()->json(['profiles' => $profiles, 'folders' => $folders]);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()]);
        }
    }

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
}
